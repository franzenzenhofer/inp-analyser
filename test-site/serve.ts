import { startTestSite } from './server.js';

const site = await startTestSite();
console.log(`[test-site] first party ${site.origin} | third party ${site.thirdPartyOrigin}`);
console.log(`[test-site] chrome flag: --host-resolver-rules="${site.hostResolverRule}"`);
