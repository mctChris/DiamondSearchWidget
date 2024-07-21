const config = require('./config');

const {Storage} = require('@google-cloud/storage');

var storage;

module.exports = function(app) {
  app.use(function (req, res, next) {
    if (!storage) {
      console.log('USE: load cloud storage');
      let temp = new Storage({keyFilename: config.cloud_storage_key});
      storage = temp.bucket(config.cloud_storage_bucket);
    }

    req.storage = storage;
    next();
  });

}
