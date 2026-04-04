
(function (global) {
  'use strict';

  const K = () => global.__KOBALT__?.api;

  const CACHE_KEY = 'kobalt_storages_active';

  async function load(apiUrl) {
    
    try {
      const r = await fetch(apiUrl + '?action=active', { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        if (json.ok) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(json)); } catch {}
          return json;
        }
      }
    } catch {}

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}

    return null;
  }

  async function storeServiceKeys(session, rawServices, H_u_bytes) {
    if (!rawServices || !rawServices.length) return;

    const D = await session._derive(); 

    for (const svc of rawServices) {
      if (!svc.id || !svc.key_enc || !svc.url) continue;

      try {
        
        const keyEncBytes = K().hexToBytes(svc.key_enc);
        const serviceKey  = await K().decrypt(keyEncBytes, H_u_bytes); 

        const keyEncD = await K().encrypt(serviceKey, D); 

        await K().saveRaw(session.db, 'svc:' + svc.id, {
          url:          svc.url,
          fallback_url: svc.fallback_url || null,
          key_enc:      K().bytesToHex(keyEncD),
          label:        svc.label || svc.id,
        });

      } catch (err) {
        console.warn('storeServiceKeys: error en servicio', svc.id, err);
      }
    }

  }

  async function computeToken(session, serviceConfig) {
    const D          = await session._derive();                      
    const keyEncBytes = K().hexToBytes(serviceConfig.key_enc);
    const serviceKey  = await K().decrypt(keyEncBytes, D);           
    const window      = Math.floor(Date.now() / 30_000);

    const ctx   = K().toBytesUtf8('kobalt:storage' + serviceConfig.id + window);
    const token = await K().H(serviceKey, ctx, 16);                  

    return { token, window };
  }

  async function callService(session, serviceConfig, action, name, body) {
    const { token, window } = await computeToken(session, serviceConfig);

    const tokenHex = K().bytesToHex(token);
    const headers  = {
      'X-Kobalt-Token':   tokenHex,
      'X-Kobalt-Window':  String(window),
    };

    const id = serviceConfig.id;

    let method = 'GET';
    let fetchBody = null;
    let qsAction, qsName;

    if (action === 'blob_put') {
      method    = 'POST';
      fetchBody = body;
      qsAction  = 'blob';
      qsName    = name;
    } else if (action === 'blob_get') {
      qsAction = 'blob';
      qsName   = name;
    } else if (action === 'list') {
      qsAction = 'list';
      qsName   = name; 
    } else if (action === 'status') {
      qsAction = 'status';
    }

    const buildUrl = (base) => {
      const u = new URL(base, location.href);
      u.searchParams.set('service', id);
      u.searchParams.set('action',  qsAction);
      if (qsName !== undefined) u.searchParams.set(action === 'list' ? 'prefix' : 'name', qsName);
      return u.toString();
    };

    const urls = [serviceConfig.url, serviceConfig.fallback_url].filter(Boolean);

    for (const url of urls) {
      try {
        const resp = await fetch(buildUrl(url), {
          method,
          headers,
          body: fetchBody || undefined,
          signal: AbortSignal.timeout(15_000), 
        });

        if (resp.ok || resp.status === 404) return resp;
        
        if (resp.status === 401) throw new Error('Token inválido: ' + id);

      } catch (err) {
        if (err.message.startsWith('Token inválido')) throw err;
        
      }
    }

    throw new Error('Servicio no disponible: ' + id);
  }

  function makeStorage(session, serviceConfig) {
    return {
      id:    serviceConfig.id,
      label: serviceConfig.label || serviceConfig.id,

      async put(name, bytes) {
        const resp = await callService(session, serviceConfig, 'blob_put', name, bytes);
        if (!resp.ok) throw new Error('put failed: ' + resp.status);
      },

      async get(name) {
        const resp = await callService(session, serviceConfig, 'blob_get', name, null);
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error('get failed: ' + resp.status);
        return new Uint8Array(await resp.arrayBuffer());
      },

      async list(prefix) {
        const resp = await callService(session, serviceConfig, 'list', prefix || '', null);
        if (!resp.ok) return [];
        const data = await resp.json();
        return data.names || [];
      },

      async status() {
        try {
          const resp = await callService(session, serviceConfig, 'status', undefined, null);
          return await resp.json();
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
    };
  }

  async function buildServices(session, activeStorages, selectedIds) {
    
    let storageList = activeStorages?.storages || [];
    if (selectedIds?.length) {
      storageList = storageList.filter(s => selectedIds.includes(s.id));
    }

    const configs = [];
    for (const s of storageList) {
      const stored = await K().loadRaw(session.db, 'svc:' + s.id);
      if (stored) {
        configs.push({ ...s, ...stored });
      }
    }

    if (!configs.length) {
      return makeEmptyStorages();
    }

    const instances = configs.map(cfg => makeStorage(session, cfg));
    return makeStorages(instances, activeStorages?.strategy);
  }

  function makeStorages(list, strategy) {
    if (!list?.length) return makeEmptyStorages();

    const strat = strategy || {};

    return {
      hasConnectors: () => true,

      async put(name, bytes, opts) {
        const mode = opts?.strategy || strat.actualidad || 'replicate_all';
        if (mode === 'replicate_all') {
          await Promise.allSettled(list.map(s => s.put(name, bytes)));
        } else {
          for (const s of list) {
            try { await s.put(name, bytes); return; } catch {}
          }
        }
      },

      async get(name) {
        for (const s of list) {
          try {
            const r = await s.get(name);
            if (r) return r;
          } catch {}
        }
        return null;
      },

      async list(prefix) {
        const all = new Set();
        for (const s of list) {
          try { (await s.list(prefix)).forEach(n => all.add(n)); } catch {}
        }
        return [...all];
      },

      async status() {
        return Promise.all(list.map(s => s.status()));
      },
    };
  }

  function makeEmptyStorages() {
    return {
      hasConnectors: () => false,
      put:    async () => {},
      get:    async () => null,
      list:   async () => [],
      status: async () => [],
    };
  }

  global.KobaltConnectors = {
    load,
    storeServiceKeys,
    buildServices,
    makeStorage,
    makeStorages,
  };

})(globalThis);
