// Cookiejar provider infrastructure is configured; credentials and owner identity are never source values.
// Optional Project Tree requires a verified PROJECT_TREE_API_URL in native runtime settings.
// Activation flags default off. Never put credential values in this file.
// Trusted operator configuration. Adding a verified service requires changing this
// registry and securely provisioning its credential, not adding endpoint handlers.
export const SERVICES=Object.freeze({
 cookiejar:{enabled:true,enableEnv:'COOKIEJAR_ENABLED',baseUrl:'https://lnh25l18k1.execute-api.us-west-2.amazonaws.com',credentialEnv:'HUB_KEY',authHeader:'Authorization',authPrefix:'Bearer ',siteHeader:'X-Site',blockedRoots:['key','admin','env','auth','oauth','credentials','tokens','secrets','password'],blockedSegments:['rotate'],uploadHost:'amplify-d20duapce4jt46-main-branc-hubsites63ef55f7-2w4f6r5l2odq.s3.us-west-2.amazonaws.com'},
 projecttree:{enabled:true,enableEnv:'PROJECT_TREE_ENABLED',baseUrlEnv:'PROJECT_TREE_API_URL',credentialEnv:'PROJECT_TREE_INGEST_TOKEN',authHeader:'x-ingest-token',authPrefix:'',blockedRoots:[],blockedSegments:[],rpc:true,readActions:['help','tree','read','search','by','view','list','get','history','links','alerts','sluglist','slugget','mailbox','mailthread','mailsent','mailcontacts','chatpending','chathistory'],writeActions:['write','describe','note','restore','submit','upload','mknode','rename','move','archive','unarchive'],reason:'Native user credential entry and activation required; API contract source-verified, not live-auth tested.'}
});
