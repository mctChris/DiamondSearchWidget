const Model = require(_base+'app/models/model');

class Configuration extends Model {
  constructor(req, res) {
    super(req, res, 'admin_config');

    this.schema = {
      project_title: {
        title: 'Project Title',
        type: 'text',
        is_required: true
      },
    }

    this.load_standard_schema(false);
  }
}

module.exports = Configuration;
