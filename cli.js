process.env.mode = 'dev';

const config = require('./app/config/config');
const MongoClient = require('mongodb').MongoClient;
let db;

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('missing arg');
    process.exit(1);
}

MongoClient.connect(config.db_uri, function(err, connection) {
    if (err) throw err;

    db = connection;

    let function_variables = args[0] + '( '; 
    for (let i = 1; i < args.length; i++) {
        function_variables += args[i] + ',';
    }
    function_variables = function_variables.slice(0, -1);
    function_variables += ')'; 
    
    eval(function_variables);

    connection.close();
});

function migrate(a, b, c) {
    console.log(a);
    console.log(b);
    console.log(c);
}
