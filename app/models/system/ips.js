const Model = require(_base+'app/models/model');

class Ips extends Model {
  constructor(req, res) {
    super(req, res, 'admin_ips');

    this.schema = {
      name: {
        title: 'Name',
        type: 'text',
        is_required: true
      },
      ip: {
        title: 'IP',
        type: 'text',
        is_required: true
      },
    }

    this.load_standard_schema(true);
  }

  async is_allow() {
    // todo
    let ip = await this.get({ip: '*.*.*.*', status: true});

    if (ip)
      return true;
    
    return false;
  }
}

module.exports = Ips;
