const Model = require(_base+'app/models/model');
const format = require('date-fns/format');
const fs = require('fs');

class Backup extends Model {
  constructor(req, res) {
    super(req, res, 'admin_backup');

    this.schema = {
      name: {
        title: 'Name',
        type: 'text',
        is_required: true
      },
      type: {
        title: 'Type',
        type: 'select', 
        values: {
          1: 'Schedule',
          2: 'Manual',
        },
      },
    }

    this.load_standard_schema(false);
  }

  // mongodump --uri mongodb+srv://dev:123@dev.rydbf.gcp.mongodb.net/framework --gzip --archive=mongodb.framework.default.gz
  backup(type) {
    let dir = './backup';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    let now = format(new Date(), 'YMMddHHmm');
    let filename = 'mongodb.' + this.req.config.db_name + '.' + now + '.gz';

    let spawn = require('child_process').spawn
    let backupProcess = spawn('mongodump', [
      '--uri=mongodb+srv://'+this.req.config.db_username+':'+this.req.config.db_password+'@'+this.req.config.db_url+'/'+this.req.config.db_name,
      '--archive='+dir+'/'+filename,
      '--gzip'
    ]);

    this.req.session.toasts.push({ type: 'success', msg: 'Backup in progress ...'});

    backupProcess.on('exit', async (code, signal) => {
      if (code) 
        console.error('Backup process exited with code ', code);
      else if (signal) 
        console.error('Backup process was killed with signal ', signal);
      else {
        let temp = {
          name: filename,
          type: type,
        }
        await this.create(temp, null);

        this.req.storage.upload(dir+'/'+filename, {
          destination: 'backup/' + filename,
          validation: 'crc32c',
        });
      } 
    });
  }

  restore() {
    //mongorestore --uri mongodb+srv://dev:123@dev.rydbf.gcp.mongodb.net/ --gzip --nsFrom="framework.*" --nsTo="newdb.*" --archive=mongodb.framework.default.gz
  }
}

module.exports = Backup;
