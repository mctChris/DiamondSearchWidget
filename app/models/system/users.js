const { ObjectID } = require("mongodb");

const Model = require(_base+'app/models/model');
const crypto = require(_base+'app/helpers/crypto');

class Users extends Model {
  constructor(req, res) {
    super(req, res, 'admin_users');

    this.schema = {
      login: {
        title: 'Login',
        type: 'text',
        is_required: true
      },
      name: {
        title: 'Name',
        type: 'text',
        is_required: true
      },
      password: {
        title: 'Password',
        type: 'password',
      },
      is_admin: {
        title: 'Is Admin',
        type: 'boolean'
      },
      permission_admin_users: {
        title: 'System Users',
        type: 'permission', 
      },
      permission_admin_ips: {
        title: 'System IP allow',
        type: 'permission', 
      },
      permission_admin_logs: {
        title: 'System Logs',
        type: 'permission', 
      },
      permission_admin_backup: {
        title: 'System Backup',
        type: 'permission', 
      },
      permission_admin_config: {
        title: 'System Configuration',
        type: 'permission', 
      },
      permission_categories: {
        title: 'Categories',
        type: 'permission', 
      },
      permission_products: {
        title: 'Products',
        type: 'permission', 
      },
    }

    this.load_standard_schema(true);
  }

  // is_login(redirect_flag = true) {
  //   if (this.req.session.admin_id) {
  //     return true;
  //   } else {
  //     if (redirect_flag) {
  //       this.res.redirect(302, '/admin/login');
  //     } else {
  //       return false;
  //     }
  //   }
  // }

  is_login() {
    if (this.req.session.admin_id) {
      return true;
    } else {
      return false;
    }
  }

  check_permission(key, level) {
    let user = this.req.session.admin_user;
    if (user && (user.is_admin || parseInt(user['permission_' + key]) >= level))
      return true;

    this.req.session.toasts.push({ type: 'error', msg: 'No permission.'});
    this.res.redirect(302, '/admin/dashboard');
    return false;
  }

  async login(login, password) {
    let user = await this.req.db.collection(this.table).findOne({login: login});

    if (user) {
      if (crypto.decrypt(user.password) == password) {
        this.req.session.admin_id = user._id;
        this.req.session.admin_user = user;
        
        this.req.session.toasts = [
          { type: 'success', msg: 'Login success, Welcome Back!'}
        ]
        return true;
      }
    }

    this.req.session.toasts = [
      { type: 'error', msg: 'Wrong login / password.'}
    ]
    return false;
  }

  logout() {
    this.req.session.admin_id = null;
    this.res.redirect(302, '/admin/login');
  }
}

module.exports = Users;
