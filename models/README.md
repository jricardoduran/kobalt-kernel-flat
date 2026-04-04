# Kobalt — Models

APIs de inteligencia artificial. La API key del proveedor
queda custodiada en el servidor. El nodo nunca la ve.

El nodo envía el prompt con token HMAC efímero.
El proxy hace la llamada real a la API del proveedor.

## Tipos planificados

- **Groq/**   — groq.com. Inferencia rápida: LLaMA 3.3, Mixtral, Gemma.
- **Gemini/** — Google Gemini API. gemini-2.0-flash, gemini-2.5-pro.

## Contrato del endpoint (M1-M2)

POST ?action=complete&service=<id>   body={prompt, max_tokens}  → {text, usage}
GET  ?action=status&service=<id>                                → {ok, model, provider}
