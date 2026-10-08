// Cookiejar provider infrastructure is configured; credentials and owner identity are never source values.
// Cookiejar access is waitlist-stage; its configuration does not grant an account.
// example_rpc is a fictional records API, not a ready-to-use provider integration.
// Its origin, header, and action names must be reviewed against any real API before use.
// Optional legacy environment aliases are compatibility only, not required setup. Never put credential values in source.
// Trusted operator configuration. Adding a verified service requires changing this
// registry or preparing it in the app, not adding business endpoint handlers.
export const SERVICES=Object.freeze({
 cookiejar:{enabled:true,enableEnv:'COOKIEJAR_ENABLED',baseUrl:'https://lnh25l18k1.execute-api.us-west-2.amazonaws.com',credentialEnv:'HUB_KEY',authHeader:'Authorization',authPrefix:'Bearer ',siteHeader:'X-Site',blockedRoots:['key','admin','env','auth','oauth','credentials','tokens','secrets','password'],blockedSegments:['rotate'],uploadHost:'amplify-d20duapce4jt46-main-branc-hubsites63ef55f7-2w4f6r5l2odq.s3.us-west-2.amazonaws.com'},
 example_rpc:{enabled:true,enableEnv:'EXAMPLE_RPC_ENABLED',baseUrlEnv:'EXAMPLE_RPC_API_URL',credentialEnv:'EXAMPLE_RPC_KEY',authHeader:'X-Example-Key',authPrefix:'',blockedRoots:[],blockedSegments:[],rpc:true,readActions:['read_record','list_records'],writeActions:['write_record','delete_record'],reason:'Fictional example only; review a real API contract and obtain access approval before adapting or activating.'}
});
