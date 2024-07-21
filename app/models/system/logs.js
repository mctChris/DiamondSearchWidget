const Model = require(_base+'app/models/model');

class Logs extends Model {
  constructor(req, res) {
    super(req, res, 'admin_logs');

    this.schema = {
      table: {
        title: 'Table',
        type: 'text',
      },
      type: {
        title: 'Type',
        type: 'select', 
        values: {
          1: 'Create',
          2: 'Update',
          3: 'Delete',
        },
      },
      related: {
        title: 'Related ID',
        type: 'text',
      },
      data: {
        title: 'Data',
        type: 'json',
      }
    }

    this.load_standard_schema(false);
  }

  async log(table, type, related, value) {
    if (this.req.session.admin_id && table != this.table) {
      let temp = {
        table: table,
        type: type,
        related: related,
        data: JSON.stringify(value),
        created_by: ObjectID(this.req.session.admin_id),
        created_at: new Date(),
      }
      
      await this.req.db.collection(this.table).insertOne(temp);   
    }
  }
}

module.exports = Logs;
