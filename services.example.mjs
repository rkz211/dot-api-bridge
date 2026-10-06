// TEMPLATE: replace reserved example hosts with verified provider contract values.
// Activation flags default off. Never put credential values in this file.
// Trusted operator configuration. Adding a verified service requires changing this
// registry and securely provisioning its credential, not adding endpoint handlers.
export const SERVICES=Object.freeze({
 cookiejar:{enabled:true,enableEnv:'COOKIEJAR_ENABLED',baseUrl:'https://cookiejar-api.example.invalid',credentialEnv:'HUB_KEY',authHeader:'Authorization',authPrefix:'Bearer ',siteHeader:'X-Site',blockedRoots:['key','admin','env','auth','oauth','credentials','tokens','secrets','password'],blockedSegments:['rotate'],uploadHost:'source-storage.example.invalid'},
 projecttree:{enabled:true,enableEnv:'PROJECT_TREE_ENABLED',baseUrl:'https://project-tree-api.example.invalid',credentialEnv:'PROJECT_TREE_INGEST_TOKEN',authHeader:'x-ingest-token',authPrefix:'',blockedRoots:[],blockedSegments:[],rpc:true,readActions:['help','tree','read','search','by','view','list','get','history','links','alerts','sluglist','slugget','mailbox','mailthread','mailsent','mailcontacts','chatpending','chathistory'],writeActions:['write','describe','note','restore','submit','upload','mknode','rename','move','archive','unarchive'],reason:'Native user credential entry and activation required; API contract source-verified, not live-auth tested.'}
});
