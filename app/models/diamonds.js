const Model = require(_base+'app/models/model');

class Diamonds extends Model {
  constructor(req, res) {
    super(req, res, 'diamonds');

    this.schema = {
      title: {
        title: 'Title',
        type: 'text',
        is_required: true
      },
    }

    this.load_standard_schema(true);
  }
}

module.exports = Diamonds;
