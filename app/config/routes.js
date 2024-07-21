var config = require('./config');
var router = require('express').Router();
var querystring = require('querystring');
var Shopify = require('shopify-api-node');
var StoreModel = require(_base+'app/models/stores');
var _ = require('lodash');
var plans = require(_base + 'app/config/plans');
var ejs = require('ejs');
var fetch = require('node-fetch');
var DiamondModel = require(_base+'app/models/diamonds');
var Excel = require('exceljs');


// frontend
router.use('/', require('../controllers/index'));
router.use('/api', require('../controllers/api/index'));

router.use('/*', auth, async function(req, res, next) {
    // register Shopify api
    req.shopify = new Shopify({
        shopName: process.env.SHOP,
        accessToken: config.accessToken,
        apiVersion: process.env.SHOPIFY_API_VERSION,
        // autoLimit: {
        //     calls: 2,
        //     interval: 2000,
        //     bucketSize: 35
        // },
        autoLimit: true,
        timeout: 960000
    });

    // register required webhooks
    var webhooks = await req.shopify.webhook.list();
    // console.log(webhooks);

    if (webhooks.length) {
        var has_required_webhooks = webhooks.find(w => w.topic === 'products/update') && webhooks.find(w => w.topic === 'products/delete') ? true : false;
    }

    if (!webhooks.length || !has_required_webhooks) {
        await req.shopify.webhook.create({
            address: config.products_update_webhook_endpoint,
            topic: 'products/update',
            format: 'json'
        })

        await req.shopify.webhook.create({
            address: config.products_delete_webhook_endpoint,
            topic: 'products/delete',
            format: 'json'
        })
    }

    req.Diamonds = new DiamondModel(req, res);
    next();
});


router.get('/delete_excel', async function(req, res) {
    console.log('delete excel');
    var diamonds = await req.Diamonds.lists({
        from: 'excel'
    })

    console.log(diamonds.length);

    req.diamonds_to_delete = diamonds;

    res.sendStatus(200);

    delete_diamonds(req);
    console.log('excel delete end');
})

router.post('/import_from_api', async function(req, res) {
    console.log('import from api');

    req.setTimeout(3600000);

    var get_diamonds_from_db = req.Diamonds.lists({
        from: "api"
    });

    var get_diamonds_from_api_1 = fetch('https://etherealdiamond.com/webServices/inventory_API.svc/GetInventory?username=rocz&password=Pp8812568&action_type=all')
        .then(res => res.json())
        .then(res => JSON.parse(res.d).RESULT);

    var get_diamonds_from_api_2 = fetch('https://www.classicgrowndiamonds.com/API/action.php', {
        method: 'POST',
        body: JSON.stringify({
            action: "diamond_stock_list",
            email: "kenny.ky.hui@gmail.com",
            password: "Pp888125",
            "startindex": "0",
            "shape": "",
            "carat ": "",
            "color": "",
            "clarity": "",
            "cut": "",
            "polish": "",
            "symm": "",
            "lab": "",
            "loatno": "",
            "certificate_no": "",
            "diamond_width_from": "",
            "diamond_width_to": "",
            "diamond_length_from": "",
            "diamond_length_to": "",
            "table_from": "",
            "table_to": "",
            "total_depth_from": "",
            "total_depth_to": "",
            "depth_per_from": "",
            "depth_per_to": "",
            "pav_angle_from": "",
            "pav_angle_to": "",
            "pavilion_depth_from": "",
            "pavilion_depth_to": "",
            "crown_height_from": "",
            "crown_height_to": "",
            "crown_angle_from": "",
            "crown_angle_to": "",
            "key_symbols": "",
            "heart_and_arrow": "",
            "eye_clean": "",
            "discount_from": "",
            "discount_to": ""
        })
    })
    .then(res => res.json())
    .then(res => res.DATA);

    var [diamonds_from_api_1, diamonds_from_api_2, diamonds_from_db] = await Promise.all([get_diamonds_from_api_1, get_diamonds_from_api_2, get_diamonds_from_db]);


    // handle error
    if (diamonds_from_api_2.status || diamonds_from_api_2.CODE === 0) {
        console.log('err happened when fetching diamonds', err);
        return res.sendStatus(404);
    }

    // add source and default shopify status
    diamonds_from_api_1.forEach(d => {
        d.vendor = "etherealdiamond";
        d.from = "api";
        d.PriceTotal = Number(d.PriceTotal) * 7.9;
        d.shopify_status = "active";
        d.shopify_price = Math.round(d.PriceTotal * 2.5);
        d.shopify_compare_at_price = 0;

        d.CUT = d.CUT === '-' || d.CUT === '' ? '' : d.CUT;

        return d;
    });

    diamonds_from_api_2 = diamonds_from_api_2.map(d => {
        var obj = {};

        obj.Weight = d.CARAT;
        obj.Shape = d.SHAPE;
        obj.Color = d.COLOR;
        obj.Clarity = d.CLARITY;
        obj.CUT = d.CUT === '-' || d.CUT === '' ? '' : d.CUT;
        obj.Polish = d.POLISH;
        obj.Symmetry = d.SYMM;
        obj.Fluorescence = d.FLURO;
        obj.LAB = d.LAB;
        obj.CERT_NO = d.CERTIFICATE_NO;
        obj.CertFile = d.CERTIFICATE;
        obj.Measure = d.MEASUREMENTS;
        obj.PriceTotal = Number(d.AMOUNT) * 7.9;
        obj.DiamondImage = d.IMAGE;
        obj.DiamondVideo = d.VIDEO;
        obj.TablePercent = d.TABLE_PER;
        obj.Girdle = d.GRIDLE;

        obj.from = "api";
        obj.vendor = "classicgrowndiamonds";
        obj.shopify_status = "active";
        obj.shopify_price = Math.round(obj.PriceTotal * 2.5);
        obj.shopify_compare_at_price = 0;

        return obj;
    })

    diamonds_from_api = [...diamonds_from_api_1, ...diamonds_from_api_2];

    // filter diamonds
    diamonds_from_api = removeUnwantedDiamonds(diamonds_from_api);

    console.log('number', diamonds_from_api.length, diamonds_from_api.filter(x => x.vendor === 'etherealdiamond').length, diamonds_from_api.filter(x => x.vendor === 'classicgrowndiamonds').length);

    // add, update, delete
    var diamonds_to_add = get_diamonds_to_add(diamonds_from_api, diamonds_from_db);
    var diamonds_to_update = get_diamonds_to_update(diamonds_from_api, diamonds_from_db);
    var diamonds_to_delete = get_diamonds_to_delete(diamonds_from_api, diamonds_from_db);
    req.tags = "import-from-api";

    console.log('add', diamonds_to_add.length);
    console.log('update', diamonds_to_update.length);
    console.log('delete', diamonds_to_delete.length);

    console.log('api end');
    res.sendStatus(200);


    if (diamonds_to_add.length) {
        req.diamonds_to_add = diamonds_to_add;
        add_diamonds(req);
    }

    if (diamonds_to_update.length) {
        req.diamonds_to_update = diamonds_to_update;
        update_diamonds(req);
    }

    if (diamonds_to_delete.length) {
        req.diamonds_to_delete = diamonds_to_delete;
        delete_diamonds(req);
    }
})

router.post('/import_from_excel', async function(req, res) {
    console.log('import from excel');

    req.setTimeout(960000);

    var wb = new Excel.Workbook();
    await wb.xlsx.readFile(req.files.excel.tempFilePath);
    var ws = wb.worksheets[0];

    // get diamonds from excel
    var columns = {};
    ws.getRow(1).values
    .filter(c => c !== undefined)
    .map((c, index) => {
        c = c.toLowerCase();
        return columns[`${c}`] = index + 1;
    })

    var diamonds_from_excel = [];
    ws.eachRow(function(row, rowNumber) {
        if (rowNumber === 1 || !row.getCell(columns.nos).value) return;

        diamonds_from_excel.push({
            Shape: row.getCell(columns.shape).toString(),
            Weight: row.getCell(columns.cts).toString(),
            Color: row.getCell(columns.color).toString(),
            Clarity: row.getCell(columns.clarity).toString(),
            CUT: row.getCell(columns.cut).toString(),
            Polish: row.getCell(columns.polish).toString(),
            Symmetry: row.getCell(columns.symm).toString(),
            Fluorescence: row.getCell(columns.fluo).toString(),
            Measure: row.getCell(columns.measurements).toString(),
            TablePercent: row.getCell(columns['table %']).toString(),
            CrownHeight: row.getCell(columns['crown height']).toString(),
            CrownAngle: row.getCell(columns['crown angle']).toString(),
            PavilionDepth: row.getCell(columns['pavilion depth']).toString(),
            PavilionAngle: row.getCell(columns['pavilion angle']).toString(),
            DepthPercent: row.getCell(columns['depth %']).toString(),
            GirdlePercent: row.getCell(columns['girdle %']).toString(),
            CuletSize: row.getCell(columns['culet size']).toString(),
            LengthWidthRatio: row.getCell(columns['l/w ratio']).toString(),
            KeyToSymbols: row.getCell(columns['key to symbol']).toString(),
            LAB: row.getCell(columns.lab).toString(),
            CERT_NO: row.getCell(columns['certificate no.']).toString(),
            CertFile: row.getCell(columns['view certi']).value.hyperlink,
            DiamondImage: null,
            DiamondVideo: row.getCell(columns['video 360']).value.hyperlink,
            RapaRate: row.getCell(columns['rap rate']).toString(),
            PriceTotal: Number(row.getCell(columns.amount).toString()) * 7.9,
            PricePerCarat: row.getCell(columns['price/ct.']).toString(),
            RapnetDiscount: row.getCell(columns['rap disc. %']).toString(),
            STATUS: row.getCell(columns.status).toString(),
            from: "excel",
            shopify_status: "active",
            shopify_price: Math.round(Number(row.getCell(columns.amount).toString()) * 7.9 * 2.5),
            shopify_compare_at_price: 0
        })
    });

    // filter diamonds from excel
    diamonds_from_excel = removeUnwantedDiamonds(diamonds_from_excel);

    // diamonds_from_excel = diamonds_from_excel.slice(0,1);
    // console.log(diamonds_from_excel);

    var diamonds_from_db = await req.Diamonds.lists({
        from: "excel"
    });

    // add, update, delete
    var diamonds_to_add = get_diamonds_to_add(diamonds_from_excel, diamonds_from_db);
    var diamonds_to_update = get_diamonds_to_update(diamonds_from_excel, diamonds_from_db);
    var diamonds_to_delete = get_diamonds_to_delete(diamonds_from_excel, diamonds_from_db);
    req.tags = "import-from-excel";

    console.log('add', diamonds_to_add.length);
    console.log('update', diamonds_to_update.length);
    console.log('delete', diamonds_to_delete.length);

    res.sendStatus(200);

    if (diamonds_to_add.length) {
        req.diamonds_to_add = diamonds_to_add;
        add_diamonds(req);
    }

    if (diamonds_to_update.length) {
        req.diamonds_to_update = diamonds_to_update;
        update_diamonds(req);
    }

    if (diamonds_to_delete.length) {
        req.diamonds_to_delete = diamonds_to_delete;
        delete_diamonds(req);
    }

})

router.get('/diamond-search', async function(req, res) {
    console.log('search');
    var data = {};
    data.diamonds = await req.Diamonds.lists({});

    data.diamonds = data.diamonds.filter(d => d.shopify_status === 'active' && Number(d.shopify_price) > 0);

    data.cts_min = Math.min(...data.diamonds.map(d => Number(d.Weight)));
    data.cts_max = Math.max(...data.diamonds.map(d => Number(d.Weight)));
    data.price_min = Math.min(...data.diamonds.map(d => Number(d.shopify_price)));
    data.price_max = Math.max(...data.diamonds.map(d => Number(d.shopify_price)));

    res.json(data);
})

router.get('/', async function(req, res) {
    var diamonds = await req.Diamonds.lists({});

    var data = {
        host: config.host,
        diamond_total: diamonds.length,
        unedited_diamond_total: diamonds.filter(d => Number(d.shopify_price) == 0).length
    };

    ejs.renderFile(_viewPath + 'index.ejs', { data: data },function(err, data) {
        if (err) console.log(err);
        res.send(data);
    });
});

function get_diamonds_to_add(diamonds_from_source, diamonds_from_db) {
    var diamonds_to_add = [];
    // add
    var obj = {};
    diamonds_from_db.forEach(el => {
        obj[el.CERT_NO] = {};
        obj[el.CERT_NO].price = el.PriceTotal;
        obj[el.CERT_NO].shopify_id = el.shopify_id;
    })

    for (var i = 0; i < diamonds_from_source.length; i++) {
        var d = diamonds_from_source[i];

        // add
        if (!obj[d.CERT_NO]) {
            diamonds_to_add.push(d);
        }
    }

    return diamonds_to_add;
}

function get_diamonds_to_update(diamonds_from_source, diamonds_from_db) {
    var diamonds_to_update = [];

    // add & update
    var obj = {};
    diamonds_from_db.forEach(el => {
        obj[el.CERT_NO] = {};
        obj[el.CERT_NO].PriceTotal = el.PriceTotal;
        obj[el.CERT_NO].shopify_id = el.shopify_id;
    })

    for (var i = 0; i < diamonds_from_source.length; i++) {
        var d = diamonds_from_source[i];

        // update: db has this record, but price is different
        if (obj[d.CERT_NO] && obj[d.CERT_NO].PriceTotal !== d.PriceTotal) {
            d.shopify_id = obj[d.CERT_NO].shopify_id;
            diamonds_to_update.push(d);
        }
    }

    return diamonds_to_update;
}

function get_diamonds_to_delete(diamonds_from_source, diamonds_from_db) {
    var diamonds_to_delete = [];

    var obj = {};
    diamonds_from_source.forEach(el => {
        obj[el.CERT_NO] = {};
    })

    for (var i = 0; i < diamonds_from_db.length; i++) {
        var d = diamonds_from_db[i];
        if (!obj[d.CERT_NO]) {
            diamonds_to_delete.push(d);
        }
    }

    return diamonds_to_delete;
}

async function add_diamonds(req) {
    // req.diamonds_to_add = req.diamonds_to_add.slice(0, 11);
    req.shopify.on('callLimits', (limits) => console.log(limits));

    // add to shopify
    var promises = [];
    var shopify_ids = [];
    for (var i = 0; i < req.diamonds_to_add.length; i++) {
        var d = req.diamonds_to_add[i];

        var add_to_shopify = req.shopify.product.create({
            title: d.CERT_NO,
            body_html: JSON.stringify(d),
            tags: req.tags,
            vendor: "import",
            status: "active",
            // published_scope: "global",
            images: [
                {src: d.DiamondImage}
            ],
            variants: [
                {
                    inventory_quantity: 1,
                    inventory_management: "shopify",
                    inventory_policy: "deny",
                    cost: d.PriceTotal,
                    price: d.shopify_price
                }
            ]
        })
        promises.push(add_to_shopify);

        if (promises.length === 10 || (i + 1) === req.diamonds_to_add.length) {
            var results = await Promise.all(promises);
            results.forEach(res => shopify_ids.push(res.id));
            promises = [];
            console.log('added d', shopify_ids.length, shopify_ids);

        }
    }

    // add to db
    var promises = [];
    for (var i = 0; i < req.diamonds_to_add.length; i++) {
        var d = req.diamonds_to_add[i];
        d.shopify_id = shopify_ids[i];
        promises.push(req.Diamonds.create(d));
    }
    await Promise.all(promises);

    console.log('added');

    // for (var i = 0; i < req.diamonds_to_add.length; i++) {
    //     var d = req.diamonds_to_add[i];

    //     // add to Shopify
    //     var add_to_shopify = await req.shopify.product.create({
    //         title: d.CERT_NO,
    //         body_html: JSON.stringify(d),
    //         tags: req.tags,
    //         vendor: "import",
    //         status: "active",
    //         // published_scope: "global",
    //         images: [
    //             {src: d.DiamondImage}
    //         ],
    //         variants: [
    //             {
    //                 inventory_quantity: 1,
    //                 inventory_management: "shopify",
    //                 inventory_policy: "deny",
    //                 cost: d.PriceTotal,
    //                 price: d.shopify_price
    //             }
    //         ]
    //     })
    //     // promises.push(add_to_shopify);

    //     // add to db
    //     d.shopify_id = add_to_shopify.id;
    //     var addToDb = await req.Diamonds.create(d);

    //     console.log('added 1 d', i, req.diamonds_to_add.length);
    // }

    // console.log('added');
}

async function delete_diamonds(req) {
    // delete from db
    // var promises = [];
    for (var i = 0; i < req.diamonds_to_delete.length; i++) {
        var d = req.diamonds_to_delete[i];
        // var del = req.Diamonds.delete({
        //     _id: ObjectID(d._id)
        // });
        // promises.push(del);
        var delete_from_db = await req.Diamonds.delete({
            _id: ObjectID(d._id)
        });

        var delete_from_shopify = await req.shopify.product.delete(d.shopify_id);
        // promises.push(delete_from_shopify);
        console.log('deleted 1 d', i, req.diamonds_to_delete.length);
    }

    // await Promise.all(promises);

    console.log('deleted');
}

async function update_diamonds(req) {
    // var promises = [];
    for (var i = 0; i < req.diamonds_to_update.length; i++) {
        // update in shopify
        var d = req.diamonds_to_update[i];
        var update_in_shopify = await req.shopify.product.update(d.shopify_id, {
            variants: [
                {
                    inventory_quantity: 1,
                    inventory_management: "shopify",
                    inventory_policy: "deny",
                    price: d.shopify_price,
                    cost: d.PriceTotal,
                }
            ]
        })
        // promises.push(update_in_shopify);

        // update in db
        var update_in_db = await req.Diamonds.update(
            {CERT_NO: d.CERT_NO},
            {
                PriceTotal: d.PriceTotal,
                shopify_price: d.shopify_price,
            }
        )

        console.log('updated 1 d', i, req.diamonds_to_update.length);
    }

    // await Promise.all(promises);

    // promises = [];
    // for (var i = 0; i < req.diamonds_to_update.length; i++) {
    //     // db update
    //     var d = req.diamonds_to_update[i];
    //     var update = req.Diamonds.update(
    //         {CERT_NO: d.CERT_NO},
    //         {
    //             PriceTotal: d.PriceTotal,
    //             shopify_price: d.shopify_price,
    //         }
    //     )
    //     // promises.push(update);
    // }

    // await Promise.all(promises);

    console.log('updated');

}

function removeUnwantedDiamonds(diamonds) {
    var color = ["D", "E", "F", "G", "H"];
    var cut = ["IDEAL", "EX", "VG", "ID"];
    var clarity = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1"];

    diamonds = diamonds.filter(d =>
        color.includes(d.Color)
        // && cut.includes(d.CUT)
        && ((cut.includes(d.CUT)) || (d.Shape.toLowerCase() !== 'round' && d.CUT === ''))
        && clarity.includes(d.Clarity)
        && d.DiamondVideo !== ""
        && Number(d.Weight) >= 1);

    return diamonds;
}

async function auth(req, res, next) {
    var is_artory = req.query.shop === 'artorydiamonds.myshopify.com' || req.headers.origin === 'https://artorydiamonds.com' || req.headers.origin === 'https://artory-diamonds-otzrvzqncq-df.a.run.app' || req.headers.origin === 'https://artorydiamonds.myshopify.com' || req.body.shop === 'artory';

    console.log('auth', req.query.shop, req.headers.origin, req.body.shop);

    if(is_artory) {
        return next();
    }

    res.json({
        msg: 'Access is denied'
    })

    // res.redirect('/install?' + querystring.stringify(req.query));

    // console.log('Already Installed');
}

module.exports = router;