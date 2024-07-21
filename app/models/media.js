const Model = require(_base+'app/models/model');
var fs = require('fs');

class Media extends Model {
  upload_folder = '';

  constructor(req, res) {
    super(req, res, 'media');
  }

  async file_upload(schema, file) {
    let file_exist = null;
    let file_key = 0;
    let file_name_split = file.name.split('.');
    let name = file_name_split.shift();
    let ext = '.' + file_name_split.pop();
    let file_mid = file_name_split.join('.');
    if (file_mid) file_mid = '.' + file_mid; 

    let file_name = this.upload_folder + name + file_mid + ext;

    do {
      file_exist = await this.req.storage.file(file_name).exists();

      if (file_exist[0]) {
        file_name = this.upload_folder + name + (++file_key) + ext;
      }
    } while(file_exist[0]);

    fs.copyFile(file.tempFilePath, _base+'media/' + file_name, (err) => {
    });

    this.req.storage.upload(file.tempFilePath, {
      destination: file_name,
      validation: 'crc32c',
      metadata: {
        cacheControl: this.req.config.media_cache,
        metadata: {
          name: file.name
        }
      }
    }, (err, file) => {
      if (schema.is_public)
        file.makePublic();
    });

    return file_name;
  }

  async upload(schema, file) {
    if (Array.isArray(file)) {
      let values = [];
      for (let i = 0; i < file.length; i++) {
        values.push(await this.file_upload(schema, file[i]));
      }
      return values;
    }
    else {
      return await this.file_upload(schema, file);
    }
  }

  async lists(where) {
    const options = {
      directory: this.upload_folder,
      delimiter: '/',
    };

    let [files] = await this.req.storage.getFiles(options);

    let result = []
    let check_type = where.accept;
    check_type = check_type.replace('*', '')
    for (let f of files) {
      if (f.name != this.upload_folder) {
        if (f.metadata.contentType.indexOf(check_type) >= 0) {
          let domain = this.req.config.base_url + 'media/';

          result.push({
            url: domain + f.name,
            name: f.name,
            type: f.metadata.contentType,
          });
        }
      }
    }

    return result;
  }
}

module.exports = Media;
