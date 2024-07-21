ObjectID = require('mongodb').ObjectID;

const crypto = require(_base+'app/helpers/crypto');

class Model {
  req = null;
  res = null;
  table = null;
  schema = [];
  media = null;
  logs = null;

  constructor(req, res, table) {
    this.req = req;
    this.res = res;
    this.table = table;

    if (this.table != 'media' && this.table != 'admin_logs') {
      let Media = require(_base+'app/models/media');
      this.media = new Media(req, res);

      let Logs = require(_base+'app/models/system/logs');
      this.logs = new Logs(req, res);
    }
  }

  async get(where) {
    try {
      let aggregates = [];
      
      aggregates = this.query_where(aggregates, where);
      aggregates = this.query_relations(aggregates);
      aggregates.push({$limit: 1});
      
      let doc = await this.req.db.collection(this.table).aggregate(aggregates).toArray();
      if (doc.length > 0) {
        doc = doc[0];

        doc = this.populate_media(doc);

        return doc;
      } else {
        return null;
      }
    } catch (err) {
      console.error(err);
      this.req.session.toasts.push({type: 'error', msg: err});
      return false;
    }
  }

  /*
    where: find query
    option:
      pageIndex (default 1)
      pageSize (integer 20)
      sortField (field name)
      sortOrder (asc, desc)
  */
  async lists(where, option) {
    try {
      let aggregates = [];
      
      aggregates = this.query_where(aggregates, where);
      aggregates = this.query_relations(aggregates);
      aggregates = this.query_sort(aggregates, option);
      aggregates = this.query_limit(aggregates, option);
      // console.log(aggregates);

      let docs = await this.req.db.collection(this.table).aggregate(aggregates).toArray();
      // console.log(docs);
      return docs;
    } catch (err) {
      console.error(err);
      this.req.session.toasts.push({type: 'error', msg: err});
      return false;
    }
  }

  async lists_count(where, option) {
    try {
      let aggregates = [];
      
      aggregates = this.query_where(aggregates, where);
      aggregates.push({
        $count: 'count'
      })
      
      let docs = await this.req.db.collection(this.table).aggregate(aggregates).toArray();
      if (docs[0]) return docs[0].count;
      return 0;
    } catch (err) {
      console.error(err);
      this.req.session.toasts.push({type: 'error', msg: err});
      return false;
    }
  }

  populate_media(doc) {
    for (let r in this.schema) {
      if (this.schema[r].type == 'upload') {
        if (!Array.isArray(doc[r]) && doc[r]) {
          doc[r] = [doc[r]];
        }
  
        for (let v in doc[r]) {
          if (doc[r][v]) {
            let url = this.req.config.base_url + 'media/';
  
            doc[r][v] = {
              url: url + doc[r][v],
              value: doc[r][v]
            }
          }
        }
      }
    }

    return doc;
  }

  async prepare_value(value, files) {
    //upload files
    if (files) {
      for (let v in files) {
        if (this.schema[v] && this.schema[v].type == 'upload') {
          let media_id = await this.media.upload(this.schema[v], files[v]);
    
          if (this.schema[v].is_multiple) {
            if (value[v] == undefined)
              value[v] = [];

            if (!Array.isArray(value[v]))
              value[v] = [value[v]];

            value[v] = value[v].concat(media_id);
          } else {
            value[v] = media_id;
          }
        }
      }
    }

    // loop all value with schema
    for (let v in value) {
      v = v.split(':'); // seperate table fields
      v = v[0];
      let temp;
      
      if (this.schema[v]) {
        switch (this.schema[v].type) {
          case 'status': 
            if (value[v] == 1)
              value[v] = true;
            else
              value[v] = false;
            break;
          case 'upload':
            if (value[v] == undefined) {
              value[v] = null;
            }
            break;
          case 'relation':
            if (typeof value[v] == 'object') {
              for (let vv in value[v]) {
                // console.log(value.store_id._bsontype, v, vv, value[v][vv])
                if (value[v][vv] != 0)
                  value[v][vv] = ObjectID(value[v][vv]);
              }
            }
            else {
              if (value[v] != 0)
                value[v] = ObjectID(value[v]);
            }
            break;
          case 'date':
            temp = value[v].toString().trim();
            if (temp != '')
              value[v] = new Date(temp);
            else
              value[v] = null;
            break;
          case 'boolean':
            value[v] = (value[v] == 1)?true:false;
            break;
          case 'number':
            value[v] = parseFloat(value[v].toString().trim());
            break;
          case 'password':
            if (value[v]) {
              value[v] = crypto.encrypt(value[v]);
            } else {
              delete value[v];
            }
            break;
          case 'table': 
            let main_array = [];
            for (let k in this.schema[v].values) {
              let key = v + ':' + k;
              let i = -1;

              for (let vv in value[key]) {
                if (i >= 0) {
                  if (main_array[i] == undefined) main_array[i] = {};
                  main_array[i][k] = value[key][vv];
                }
                i++;
              }
              delete value[key];
            }
            value[v] = main_array;
            break;
          default:
            // temp = value[v].toString().trim();
            temp = value[v];
            if (temp == '')
              temp = null;
            value[v] = temp;
            break;
        }
      } else {
        //not exist in schema
        // delete value[v];
        temp = value[v];
        // temp = value[v].toString().trim();
        if (temp == '')
          temp = null;
        value[v] = temp;
      }
    }

    return value;
  }

  query_where(aggregates, where) {
    aggregates.push({
      $match: where
    });

    return aggregates;
  }

  query_relations(aggregates) {
    for (let s in this.schema) {
      if (this.schema[s].type == 'relation') {
        let temp = {
          $lookup : {
            from: this.schema[s].foreign,
            localField: s,
            foreignField: '_id',
            as: s
          }
        }
        aggregates.push(temp);
      }
    }

    return aggregates;
  }

  query_limit(aggregates, option) {
    if (option && option.pageSize && option.pageIndex) {
      let temp = {
        $skip : (parseInt(option.pageIndex) - 1) * parseInt(option.pageSize)
      }

      temp = {
        $limit : parseInt(option.pageSize)
      }
      aggregates.push(temp);
    }
    return aggregates;
  }

  query_sort(aggregates, option) {
    if (option && option.sortField) {
      let temp = {
        $sort : {[option.sortField] : ((option.sortOrder == 'asc')?1:-1)}
      }
      aggregates.push(temp);
    }
    return aggregates;
  }

  field_filter(key, value) {
    let temp;
    if (this.schema[key]) {
      switch (this.schema[key].type) {
        case 'status':
          temp = (value == '1')?true:false;
          return {'$eq': temp}
        case 'relation':
          if (value && value != '0') {
            // console.log(value);
            return {'$in':[ObjectID(value)]};
          } else
            return null;
          break;
        case 'date':
          temp = {}
          let flag = false;
          if (value['from']) {
            value = new Date(value['from'].toString().trim());
            temp['$gte'] = value;
            flag = true;
          }
          if (value['to']) {
            value = new Date(value['to'].toString().trim());
            temp['$lte'] = value;
            flag = true;
          }
          if (flag)
            return temp;
          else
            return null;
          break;
        case 'boolean':
          value = (value == 'true')?true:false;
          return {'$eq': value};
          break;
        case 'number':
          value = parseFloat(value.toString().trim());
          return {'$eq': value};
          break;
        case 'select': 
          if (value != 0)
            return {'$eq': value};
          break;
        default:
          return {'$regex': value};
      }
    } else {
      // not exist in schema
      // return null;
      return {'$regex': value};
    }
  }

  load_standard_schema(status_flag = true) {
    if (status_flag) {
      this.schema.status = {
        title: 'Status',
        type: 'status',
      };
      this.schema.online_date = {
        title: 'Online Date',
        type: 'date'
      };
      this.schema.offline_date = {
        title: 'Offline Date',
        type: 'date'
      };
    }

    this.schema.created_at = {
      title: 'Created At',
      type: 'date'
    };
    this.schema.created_by = {
      title: 'Created By',
      type: 'relation',
      foreign: 'admin_users',
      foreign_label: 'name',
    };
    
    this.schema.updated_at = {
      title: 'Updated At',
      type: 'date'
    };
    this.schema.updated_by = {
      title: 'Updated By',
      type: 'relation',
      foreign: 'admin_users',
      foreign_label: 'name',
    };
  }

  async create(value, files) {
    value = await this.prepare_value(value, files);
    value.created_at = new Date();

    if (this.req.session.admin_id) {
      value.created_by = ObjectID(this.req.session.admin_id);
    }

    try {
      let record = await this.req.db.collection(this.table).insertOne(value);

      await this.logs.log(this.table, '1', record.ops[0]._id, value);

      this.req.session.toasts.push({ type: 'success', msg: 'Create success.'});
      return record.ops[0]._id;
    } catch (err) {
      console.error(err);
      this.req.session.toasts.push({ type: 'error', msg: err});
      return false;
    }
  }

  async update(where, value, files) {
    value = await this.prepare_value(value, files);
    value.updated_at = new Date();

    if (this.req.session.admin_id) {
      value.updated_by = ObjectID(this.req.session.admin_id);
    }

    try {
      // console.log(value);
      await this.req.db.collection(this.table).updateOne(
        where,
        {$set : value}
      );

      await this.logs.log(this.table, '2', where._id, value);

      this.req.session.toasts.push({ type: 'success', msg: 'Update success.'});
      return true;
    } catch (err) {
      console.error(err);
      this.req.session.toasts.push({ type: 'error', msg: err});
      return false;
    }
  }

  async delete(where) {
    try {
      await this.req.db.collection(this.table).deleteMany(where);

      await this.logs.log(this.table, '3', where._id.$in, null);

      this.req.session.toasts.push({ type: 'success', msg: 'Delete success.'});
      return true;
    } catch (err) {
      console.error(err);
      this.req.session.toasts.push({ type: 'error', msg: err});
      return false;
    }
  }
}

module.exports = Model;
