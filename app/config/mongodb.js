const config = require('./config');

const MongoClient = require('mongodb').MongoClient;
const client = new MongoClient(config.db_uri);

var connection;

const session = require('express-session');
const MongoStore = require('connect-mongo')(session);

module.exports = async function(app) {
  if (app) {
    app.use(function (req, res, next) {
      if (!connection) {
        console.log('USE: connect db');
        connection = client.connect();
      }

      connection.then(function(db) {
        req.db = db.db(config.db_name);
        next();
      }).catch(function(err) {
        next();
      });
    });

    app.use(session({
      secret: config.session_secret,
      resave: true,
      saveUninitialized: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 2
      },
      store: new MongoStore({ client: client }),
    }));

    app.use((req, res, next) => {
      const oldRedirect = res.redirect;
      res.redirect = function (...args) {
        if (req.session) {
          // redirecting after saving...
          req.session.save(() => Reflect.apply(oldRedirect, this, args))
        } else {
          Reflect.apply(oldRedirect, this, args);
        }
      }
      next();
    })
  } else {
    //for cli
    connection = await client.connect();
    let db = connection.db(config.db_name);
    console.log(db);
  }
}
