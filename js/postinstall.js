const Promise = require('promise');
const ncp = Promise.denodeify(require('ncp').ncp);

ncp.limit = 16;

function copyFilesForLifecycle(lifecycle) {
  if (!lifecycle) {
    console.log('BUILD_LIFECYCLE was null');
    return;
  }

  ncp(`site-configs/process-${lifecycle}.json`, 'process.json')
    .then(() => console.log('process.json copied'))
    .catch(console.error);

  console.log('BUILD_LIFECYCLE = ', lifecycle);
}

copyFilesForLifecycle(process.env.BUILD_LIFECYCLE);