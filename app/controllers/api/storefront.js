const router = require('express').Router();
const { ObjectID } = require('mongodb');
const StoreModel = require(_base+'app/models/stores');
const config = require(_base + '/app/config/config');
const _ = require('lodash')
const Shopify = require('shopify-api-node');
const moment = require('moment');
const fetch = require('node-fetch');

router.use(async function(req, res, next){
    const {domain} = req.body;

    const Store = new StoreModel(req, res);
    const store = await Store.get({
      domain: domain
    })

    if(!store){
        return res.status(404).send({msg: "No Store Found"});
    }

    req.shopify = new Shopify({
        shopName: store.domain,
        accessToken: store.access_token,
        apiVersion: '2021-01',
    });

    req.auth_store = store;
    req.storeModel = new StoreModel(req, res);
    req.currentPlan = await req.storeModel.getCurrentPlan();

    next();
});

router.post('/order', async function (req, res){
    const {items, customerId, currency, shipping_line, couponCode} = req.body;
    const cart = await getDiscountedCart(req, res, items, customerId, couponCode);

    let lineItems = [];

    cart.items.map(item => {
        lineItems.push({
            variant_id: item.variant_id,
            title: item.title,
            price: item.original_line_price,
            quantity: item.quantity,
            applied_discount: item.final_discounts,
        })
    })

    const order = await req.shopify.draftOrder.create({
        line_items: lineItems,
        customer: {
            id: customerId
        },
        use_customer_default_address: true,
        currency: currency,
        shipping_line: shipping_line
    }).catch(function(err) {
        console.log(err);
    })

    return res.json(order);
});

router.post('/cart', async function (req, res) {
    const {items, customerId, couponCode} = req.body;

    const cart = await getDiscountedCart(req, res, items, customerId, couponCode);
    return res.json(cart);
});

router.post('/crosssell_offer', async function(req, res) {
    const CrosssellRule = new CrosssellRuleModel(req, res);
    const crosssellRules = await CrosssellRule.lists({
        store_id: req.auth_store._id,
    });

    return res.json(crosssellRules);
});

router.post('/quantity_discount_offer', async function(req, res) {
    const QuantityDiscountRule = new QuantityDiscountRuleModel(req, res);
    const quantityDiscountRules = await QuantityDiscountRule.lists({
        store_id: req.auth_store._id,
    });

    let rulesWithCurrentProduct = quantityDiscountRules.filter(rule => rule.products.some(prod => prod.id === req.body.productId));

    return res.json(rulesWithCurrentProduct);
})


router.post('/crosssell_offer_promote_products', async function(req, res) {
    let position = req.body.position;
    let offers = req.body.offers;
    let triggerProductId = req.body.triggerProdId;
    let promoteProducts = [];

    // get product that can only be shown to the TRIGGER product
    if (position == 'product' && triggerProductId) {
        console.log('trigger');

        let productTemp = [];

        let offersWithThisTrigger = [];
        for (let i = 0; i < offers.length; i++) {
            if (!offers[i].triggerProducts) continue;

            offers[i].triggerProducts.forEach(o => {
                if (o.id.includes(triggerProductId)) {
                    offersWithThisTrigger.push(offers[i]);
                    return;
                }
            })
        }

        offersWithThisTrigger.forEach(offer => {
            offer.promoteProducts.map(prod => productTemp.push(prod));
        })

        console.log('temp prod', productTemp);

        try {
            // statements
            promoteProducts = await getProducts(req, productTemp);
        } catch(e) {
            // statements
            console.log(e, 'error in getProduct');
        }

        console.log('finish gathered products');

        return res.json(promoteProducts);    
    }

    // get product that can be shown when ANY product is added to cart
    if (position == 'product' && !triggerProductId) {
        console.log('any');

        let productTemp = [];

        offers
            .filter(offer => offer.timeToDisplay[0] == 'any')
            .forEach(o => o.promoteProducts.map(prod => productTemp.push(prod)));

        promoteProducts = await getProducts(req, productTemp);

        return res.json(promoteProducts);
    }

    // get product for cart page
    if (position == 'cart') {
        console.log('cart');

        let productTemp = [];

        offers.forEach(o => o.promoteProducts.map(prod => productTemp.push(prod)));

        promoteProducts = await getProducts(req, productTemp);

        return res.json(promoteProducts);
    }

});

router.post('/is_trigger_product', async function(req, res) {
    let productId = req.body.productId;
    let isTriggerProd = false;
    let triggerProds = {};

    const CrosssellRule = new CrosssellRuleModel(req, res);
    const crosssellRules = await CrosssellRule.lists({
        store_id: req.auth_store._id,
    });

    let triggerProductRules = crosssellRules.map(rule => rule.triggerProducts);

    triggerProductRules.forEach(rule => {
        triggerProds = _.extend(triggerProds, rule);
    })

    if (_.find(triggerProds, {id: `gid://shopify/Product/${productId}`})) {
        isTriggerProd = true;
    }

    return res.json(isTriggerProd);
});


router.post('/get_current_product', async function(req, res) {
    let productId = req.body.productId;
    let shopifyProduct = await req.shopify.product.get(productId);

    return res.json(shopifyProduct);

})

async function getProducts(req, products) {
    let finalPromoteProds = [];

    for(let i = 0; i < products.length; i++) {
        let prod = products[i];

        let p;
        let productId = prod.id.replace("gid://shopify/Product/", '')
        let shopifyProduct = await req.shopify.product.get(productId);

        p = shopifyProduct;
        p.discountType = prod.discountType;
        p.discountAmount = prod.discountAmount;

        finalPromoteProds.push(p);        
    }

    return finalPromoteProds;
}


async function getDiscountedCart(req, res, items, customerId, couponCode){
    const DiscountRule = new DiscountRuleModel(req, res);
    const discountRules = _.groupBy(await DiscountRule.lists({
        store_id: req.auth_store._id,
    }), 'type');

    const CrosssellRule = new CrosssellRuleModel(req, res);
    const crosssellRules = await CrosssellRule.lists({
        store_id: req.auth_store._id,
    })

    if (crosssellRules.length) {
        discountRules.crosssell = [...crosssellRules];
    }

    const QuantityDiscountRule = new QuantityDiscountRuleModel(req, res);
    const quantityDiscountRules = await QuantityDiscountRule.lists({
        store_id: req.auth_store._id
    })

    if (quantityDiscountRules.length) {
        discountRules.quantityRule = [...quantityDiscountRules];
    }

    const customer = await req.shopify.customer.get(customerId)
    .catch((err) => {
        console.log(err.message)
    })

    let orders;

    if(customer){
        orders = await req.shopify.customer.orders(customerId, {
            status: 'any'
        })
        .catch((err) => {
            console.log(err.message)
        });
    
    }

    // Validating coupon code
    if (couponCode) {
        if (!await doesCouponCodeExist(req, couponCode) || !await isCouponCodeValid(req, couponCode, items, customerId)) {
            couponCode = undefined;
        }
    }

    items = await Promise.all(_.map(items, item => getDiscountedItem(req, item, discountRules, customer, orders, couponCode)));

    let cart = {
        items: items,
        original_total_price: _.sumBy(items, 'original_line_price'),
        total_price: _.sumBy(items, 'final_line_price'),
        total_discount: _.sumBy(items, 'line_discount'),
        free_shipping: items.some(item => item.free_shipping == true)
    }




    return cart;
}

async function getDiscountedItem(req, item, discountRules, customer, orders, couponCode){
    const p1 = req.shopify.product.get(item.product_id);
    const p2 = req.shopify.productVariant.get(item.variant_id);
    const p3 = req.shopify.customCollection.list({product_id: item.product_id});
    const p4 = req.shopify.smartCollection.list({product_id: item.product_id});
    

    let product, productVariant, collects;

    await Promise.all([p1, p2, p3, p4]).then(values => {
        product = values[0];
        productVariant = values[1];
        // collects = values[2];
        collects = _.concat(values[2], values[3]);

    });

    item.discounts = [];
    item.original_price = parseFloat(productVariant.price);
    item.original_line_price = item.original_price * item.quantity;
    item.discounted_price = item.original_price;
    item.title = product.title;

    let appliedDiscounts = [];

    // Tiered Discount
    if(discountRules.tiered && customer && orders){
        const tieredDiscount = calcTieredDiscountRate(req, item, discountRules.tiered, collects, customer, orders);
        if(tieredDiscount.id){
            appliedDiscounts.push({
                id: tieredDiscount.id,
                label: tieredDiscount.label,
                value: tieredDiscount.value,
                value_type: tieredDiscount.value_type,
            })
        }
    }

    // Upsell / Cross-sell Discount
    if (discountRules.crosssell) {
        const crosssellDiscount = calcCrosssellDiscountRate(item, discountRules.crosssell);

        appliedDiscounts = _.concat(appliedDiscounts, crosssellDiscount);
    }

    // Quantity Discount 
    if (discountRules.quantityRule) {
        const quantityDiscount = calcQuantityDiscountRate(item, discountRules.quantityRule);

        appliedDiscounts = _.concat(appliedDiscounts, quantityDiscount);
    }


    if (couponCode) {
        const couponDiscount = await calcCouponCodeDiscount(req, item);

        appliedDiscounts = _.concat(appliedDiscounts, couponDiscount);
    }

    item = applyDiscount(item, appliedDiscounts);
    item = calcItemFinalPrice(item)
    return item;
}

async function calcCouponCodeDiscount(req, item) {
    let couponCodeDiscountRules = [];
    let type = req.shopify.coupon['priceRuleType'];

    if (type == 'percentage') {
        couponCodeDiscountRules = await calcPercentageCouponDiscount(req, item);
    }

    if (type == 'fixed_amount') {
        couponCodeDiscountRules = await calcFixedAmountCouponDiscount(req, item);
    }

    if (type == 'free_shipping') {
        couponCodeDiscountRules = calcFreeShippingCouponDiscount(req);
    }

    if (type == 'buyXGetY') {
        couponCodeDiscountRules = await calcBuyXGetYCouponDiscount(req, item);
    }

    return couponCodeDiscountRules;

}


async function calcPercentageCouponDiscount(req, item) {
    let percentageCouponDiscountRules = [];
    let rule = req.shopify.coupon['priceRule'];
    let itemTypeToApply = applyToProductOrCollection(rule);

    console.log(itemTypeToApply);

    if (itemTypeToApply == 'all') {
        percentageCouponDiscountRules.push({
            id: 'coupon',
            label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
            discount_type: 'coupon',
            value: Math.abs(Number(rule.value)),
            value_type: 'percentage'
        })
    }

    if (itemTypeToApply == 'product') {
        let canCurrentItemUseCouponCode = rule.entitled_product_ids.some(id => id == Number(item.product_id));

        if (canCurrentItemUseCouponCode) {
            percentageCouponDiscountRules.push({
                id: 'coupon',
                label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
                discount_type: 'coupon',
                value: Math.abs(Number(rule.value)),
                value_type: 'percentage'                
            })
        }
    }

    if (itemTypeToApply == 'collection') {
        console.log(12312398, item);
        let itemCollections = [];

        let collections = await req.shopify.collect.list({
            product_id: item.product_id
        })

        let smartCollections = await req.shopify.smartCollection.list({
            product_id: item.product_id
        })

        collections.map(collect => itemCollections.push(collect.collection_id));
        smartCollections.map(collect => itemCollections.push(collect.id));

        let isThisItemHasRequiredCollection = rule.entitled_collection_ids.some(collectId => itemCollections.includes(collectId));

        if (isThisItemHasRequiredCollection) {
            percentageCouponDiscountRules.push({
                id: 'coupon',
                label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
                discount_type: 'Coupon',
                value: Math.abs(Number(rule.value)),
                value_type: 'percentage'                
            })
        }
    }

    return percentageCouponDiscountRules;
}

async function calcFixedAmountCouponDiscount(req, item) {
    let fixedAmountCouponCodeRules = [];
    let rule = req.shopify.coupon['priceRule'];
    let itemTypeToApply = applyToProductOrCollection(rule);

    if (itemTypeToApply == 'all') {
        fixedAmountCouponCodeRules.push({
            id: 'coupon',
            label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
            discount_type: 'coupon',
            value: Math.abs(Number(rule.value)),
            value_type: 'fixed_amount'
        })
    }

    if (itemTypeToApply == 'product') {
        let canCurrentItemUseCouponCode = rule.entitled_product_ids.some(id => id == Number(item.product_id));

        if (canCurrentItemUseCouponCode) {
            fixedAmountCouponCodeRules.push({
                id: 'coupon',
                label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
                discount_type: 'coupon',
                value: Math.abs(Number(rule.value)),
                value_type: 'fixed_amount'                
            })
        }
    }

    if (itemTypeToApply == 'collection') {
        let itemCollections = [];

        let collections = await req.shopify.collect.list({
            product_id: item.product_id
        })

        let smartCollections = await req.shopify.smartCollection.list({
            product_id: item.product_id
        })

        collections.map(collect => itemCollections.push(collect.collection_id));
        smartCollections.map(collect => itemCollections.push(collect.id));

        let isThisItemHasRequiredCollection = rule.entitled_collection_ids.some(collectId => itemCollections.includes(collectId));

        if (isThisItemHasRequiredCollection) {
            fixedAmountCouponCodeRules.push({
                id: 'coupon',
                label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
                discount_type: 'Coupon',
                value: Math.abs(Number(rule.value)),
                value_type: 'fixed_amount'                
            })
        }
    }

    return fixedAmountCouponCodeRules;
}

function calcFreeShippingCouponDiscount(req) {
    let freeShippingCouponDiscount = [];

    freeShippingCouponDiscount.push({
        id: 'coupon',
        label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
        discount_type: 'coupon',
        value_type: 'free_shipping'
    })

    return freeShippingCouponDiscount;
}

async function calcBuyXGetYCouponDiscount(req, item) {
    let buyXGetYCouponDiscount = [];
    let rule = req.shopify.coupon['priceRule'];
    let entitledProductIds = rule.entitled_product_ids;
    let itemTypeToApply = applyToProductOrCollection(rule);

    if (itemTypeToApply == 'product') {
        let canCurrentItemUseCouponCode = rule.entitled_product_ids.some(id => id == Number(item.product_id));

        if (canCurrentItemUseCouponCode) {
            buyXGetYCouponDiscount.push({
                id: 'coupon',
                label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
                discount_type: 'coupon',
                value: Math.abs(Number(rule.value)),
                value_type: 'percentage',
                allocation_limit: rule.allocation_limit            
            })
        }      
    }

    if (itemTypeToApply == 'collection') {
        let itemCollections = [];

        let collections = await req.shopify.collect.list({
            product_id: item.product_id
        })

        let smartCollections = await req.shopify.smartCollection.list({
            product_id: item.product_id
        })

        collections.map(collect => itemCollections.push(collect.collection_id));
        smartCollections.map(collect => itemCollections.push(collect.id));

        let isThisItemHasRequiredCollection = rule.entitled_collection_ids.some(collectId => itemCollections.includes(collectId));

        if (isThisItemHasRequiredCollection) {
            canCurrentItemUseCouponCode.push({
                id: 'coupon',
                label: `Coupon(${req.shopify.coupon['couponCode'].code})`,
                discount_type: 'Coupon',
                value: Math.abs(Number(rule.value)),
                value_type: 'percentage',
                allocation_limit: rule.allocation_limit         
            })
        }        
    }

    return buyXGetYCouponDiscount;
}

function calcQuantityDiscountRate(item, discountRules) {
    let quantityDiscountRules = [];
    let offerToApply = {};

    discountRules.forEach(rule => {
        let canApplyQtyDiscount = _.find(rule.products, { 'id': `gid://shopify/Product/${item.product_id}` }) ? true : false;

        if (canApplyQtyDiscount) {
            let qtyCount = 0;
            let itemQty = Number(item.quantity);

            // decide which offer in the rule to apply
            rule.offers.forEach(offer => {
                let offerQty = Number(offer.quantity);

                if (offerQty > qtyCount && itemQty >= offerQty) {
                    qtyCount = offerQty;

                    offerToApply = offer;
                }
            })

            if (!_.isEmpty(offerToApply)) {
                quantityDiscountRules.push({
                    id: rule._id,
                    label: rule.name,
                    discount_type: rule.type,
                    value: Number(offerToApply.discount),
                    value_type: offerToApply.discountType
                })
            }
        }
    })

    return quantityDiscountRules;
}


function calcCrosssellDiscountRate(item, discountRules) {
    let crosssellRules = [];

    for (let i = 0; i < discountRules.length; i++) {
        let id, label, value, value_type;
        let promoteProducts = [];

        crosssellRules.push({
            id: discountRules[i]._id,
            label: discountRules[i].name,
            discount_type: 'crosssell',
            promoteProducts: discountRules[i].promoteProducts
        })
    }

    return crosssellRules;
}


function calcTieredDiscountRate(req, item, discountRules, collects, customer, orders){
    const productId = "gid://shopify/Product/" + item.product_id;

    let selectedDiscountRate = 0;
    let id;
    let label;

    for(let i = 0; i < discountRules.length; i++){
        const rule = discountRules[i];
        let excludeProducts = rule.excludeProducts || [];
        let differentDiscountRules = rule.differentDiscountRules || [];
        let discountRate = Number(rule.discountRate);
        let totalSpent = 0;

        if(rule.effectiveTime == 'life_time'){
            totalSpent = Number(customer.total_spent);
        }else{
            totalSpent = _.sumBy(
                // get orders that are within effective time
                _.filter(orders, order => {
                    return moment(order.created_at).isAfter(moment().subtract(rule.effectiveTime, 'months'));
                }), 
                order => Number(order.total_price)
            );
        }

        // for Happybabestore, once a customer becomes VIP, the role is permanent.
        let customerTags = customer.tags.toLowerCase();
        let ruleLabel = rule.label.toLowerCase();

        if (req.auth_store.domain == 'happybabestore.myshopify.com' &&
            customerTags.indexOf('vip') != -1 &&
            ruleLabel.indexOf('vip') != -1) {

            console.log('rule for Happybabe', customerTags.indexOf('vip'), ruleLabel.indexOf('vip'));
            totalSpent = 99999;
        }

        console.log('total spent', totalSpent);


        if(totalSpent < rule.spendingAmountExceed){
            continue;
        }

        if(_.find(excludeProducts, {id: productId})){
            continue;
        }

        collects.map(function(collect){
            const collectionId = "gid://shopify/Collection/" + collect.id;
            // const collectionId = "gid://shopify/Collection/" + collect.collection_id;

            for(let j = 0; j < differentDiscountRules.length; j++){
                const diffRule = differentDiscountRules[i];
                if(_.find(diffRule.collections, {id: collectionId})){
                    discountRate = Number(diffRule.discountRate);
                }
            }
            
        });

        if(discountRate > selectedDiscountRate){
            selectedDiscountRate = discountRate
            id = rule._id
            label = rule.label
        }
    }

    return {
        id,
        label,
        value: selectedDiscountRate,
        value_type: 'percentage'
    }
}

function applyDiscount(item, appliedDiscounts){
    if(appliedDiscounts.length == 0) return item;


    let finalDiscountRateMultiplier = 1;
    let finalDiscountFixedAmount = 0;
    let finalDiscountValueType;
    let finalDiscountValue;

    appliedDiscounts = appliedDiscounts
    .filter(discount => {
        let currentPromoteProd = _.find(discount.promoteProducts, {'id': `gid://shopify/Product/${item.product_id}` });


        if (discount.discount_type == 'crosssell' && (!currentPromoteProd || !currentPromoteProd.discountAmount)) return false;

        return true;
    })
    .map((discount, index) => {
        // tier discount rule / quantity discount rule / coupon (percentage, fixed_amount)
        if (discount.value && discount.discount_type != 'crosssell') {
            if(discount.value_type == 'percentage'){
                let rate = 1 - discount.value / 100;
                discount.amount = (item.original_price * finalDiscountRateMultiplier) - (item.original_price * finalDiscountRateMultiplier * rate);
                discount.line_amount = (item.original_line_price * finalDiscountRateMultiplier) - (item.original_line_price * finalDiscountRateMultiplier * rate);

                finalDiscountRateMultiplier *= rate;
            }else if(discount.value_type == 'fixed_amount'){
                finalDiscountFixedAmount += discount.value;
                discount.amount = discount.value;
                discount.line_amount = discount.value * Number(item.quantity);
            }
        }

        // crosssell discount rule
        if (discount.discount_type == 'crosssell') {
            // get discount value and value_type for this particular product
            let prod = _.find(discount.promoteProducts, {'id': `gid://shopify/Product/${item.product_id}` });

            discount.value = prod.discountAmount;
            discount.value_type = prod.discountType;

            if(discount.value_type == 'percentage'){
                let rate = 1 - discount.value / 100;

                discount.amount = (item.original_price * finalDiscountRateMultiplier) - (item.original_price * finalDiscountRateMultiplier * rate);

                discount.line_amount = (item.original_line_price * finalDiscountRateMultiplier) - (item.original_line_price * finalDiscountRateMultiplier * rate);

                finalDiscountRateMultiplier *= rate;
            }else if(discount.value_type == 'fixed_amount'){
                finalDiscountFixedAmount += discount.value;
                discount.amount = discount.value;
                discount.line_amount = discount.value * Number(item.quantity);
            }
        }

        if (discount.discount_type == 'coupon' && discount.value_type == 'free_shipping') {
            item.free_shipping = true;
        }




        return discount;
    });

    item.discounted_price = item.original_price * finalDiscountRateMultiplier - finalDiscountFixedAmount;

    // take out free shipping rule for individual item
    item.discounts = appliedDiscounts.filter(discount => discount.value_type != 'free_shipping');

    item.final_discounts = {
        title: _.join(_.map(appliedDiscounts, 'label'), ' + '),
        description: JSON.stringify(appliedDiscounts),
        value_type: 'fixed_amount',
        value: item.original_price - item.discounted_price,
        amount: (item.original_price - item.discounted_price) * item.quantity,
    }

    return item;
}

function tieredDiscountCalcMethod(item, discount, multiplier, fixed_amount) {
    if(discount.value_type == 'percentage'){
        let rate = 1 - discount.value / 100;
        discount.amount = item.original_price - item.original_price * multiplier * rate;
        discount.line_amount = item.original_line_price - item.original_line_price * multiplier * rate;
        multiplier *= rate;
    }else if(discount.value_type == 'fixed_amount'){
        fixed_amount += discount.value;
        discount.amount = discount.value;
        discount.line_amount = discount.value;
    }

    return discount;
}

function crosssellDiscountCalcMethod(item, discount, multiplier, fixed_amount) {

    return discount;
}


async function doesCouponCodeExist(req, couponCode) {
    try {
        let couponCodeData = await req.shopify.discountCode.lookup({
            code: couponCode
        });

        req.shopify.coupon = {};
        req.shopify.coupon['couponCode'] = couponCodeData;

        return true;
    } catch(e) {
        console.log("can't find code", couponCode);
        return false;
    } 
}

async function isCouponCodeValid(req, couponCode, items, customerId) {
    let priceRule = await req.shopify.priceRule.get(req.shopify.coupon['couponCode'].price_rule_id);
    let ruleType = getPriceRuleType(priceRule);

    req.shopify.coupon['priceRule'] = priceRule;
    req.shopify.coupon['priceRuleType'] = ruleType;

    if (ruleType == 'percentage' || ruleType == 'fixed_amount') {
        if (!await canUseCodeForCurrentCartProducts(req, priceRule, items) || 
            !await canUseCodeForCurrentCustomer(req, priceRule, customerId) || 
            !await canMeetMinimumRequirement(req, priceRule, items, couponCode, customerId) || 
            !canUseCodeForCurrentDate(priceRule) || 
            !await canMeetUsageLimits(req, priceRule, couponCode, customerId)) {

            return false;
        }
    }

    // for free shipping coupon
    if (ruleType == 'free_shipping') {
        if (!await canUseCodeForCurrentCustomer(req, priceRule, customerId) || 
            !await canMeetMinimumRequirement(req, priceRule, items, couponCode, customerId) || 
            !canUseCodeForCurrentDate(priceRule) || 
            !await canMeetUsageLimits(req, priceRule, couponCode, customerId)) {

            return false;
        }
    }

    // for buy x get y coupon
    if (ruleType == 'buyXGetY') {
        if (!await canMeetBuyXGetYRequirement(req, priceRule, items) ||
            !await canUseCodeForCurrentCustomer(req, priceRule, customerId) || 
            !await canMeetMinimumRequirement(req, priceRule, items, couponCode, customerId) || 
            !canUseCodeForCurrentDate(priceRule) || 
            !await canMeetUsageLimits(req, priceRule, couponCode, customerId)) {

            return false;
        }
    }

    return true;
}

async function canMeetBuyXGetYRequirement(req, priceRule, items) {
    let buyXGetYType = getBuyXGetYType(priceRule);
    let prerequisiteItemType = priceRule.prerequisite_product_ids.length > 0 ? 'product': 'collection';
    let entitledItemType = priceRule.entitled_product_ids.length > 0 ? 'product' : 'collection';
    let requiredEntitledQty = priceRule.prerequisite_to_entitlement_quantity_ratio.entitled_quantity;

    if (buyXGetYType == 'quantity') {
        let requiredPrerequisiteQty = priceRule.prerequisite_to_entitlement_quantity_ratio.prerequisite_quantity;

        if (prerequisiteItemType == 'product') {
            let requiredPrerequisiteProductIds = priceRule.prerequisite_product_ids;
            let hasEnoughPrerequisiteProducts = hasEnoughProductsForBuyXGetY(req, items, requiredPrerequisiteProductIds, requiredPrerequisiteQty);

            if (!hasEnoughPrerequisiteProducts) return false;
        }

        if (prerequisiteItemType == 'collection') {
            let requiredPrerequisiteCollectionIds = priceRule.prerequisite_collection_ids;

            let hasEnoughPrerequisiteProductsFromSpecificCollections = await hasEnoughProductsFromSpecificCollectionsForBuyXGetY(req, items, requiredPrerequisiteCollectionIds, requiredPrerequisiteQty);

            if (!hasEnoughPrerequisiteProductsFromSpecificCollections) return false;
        }
    }

    if (buyXGetYType == 'purchase_amount') {
        let requiredPrerequisitePurchaseAmount = priceRule.prerequisite_to_entitlement_purchase.prerequisite_amount;

        if (prerequisiteItemType == 'product') {
            let requiredPrerequisiteProductIds = priceRule.prerequisite_product_ids;
            let hasMetPrerequisiteProductPurchaseAmount = await hasMetPrerequisiteProductPurchaseAmountForBuyXGetY(req, items, requiredPrerequisiteProductIds, requiredPrerequisitePurchaseAmount);

            if (!hasMetPrerequisiteProductPurchaseAmount) return false; 
        }

        if (prerequisiteItemType == 'collection') {
            let requiredPrerequisiteCollectionIds = priceRule.prerequisite_collection_ids;
            let hasMetPrerequisiteCollectionPurchaseAmount = await hasMetPrerequisiteCollectionPurchaseAmountForBuyXGetY(req, items, requiredPrerequisiteCollectionIds, requiredPrerequisitePurchaseAmount);

            if (!hasMetPrerequisiteCollectionPurchaseAmount) return false;
        }
    }

    // the following 2 conditions happen for both buy x get y types
    if (entitledItemType == 'product') {
        let requiredEntitledProductIds = priceRule.entitled_product_ids;
        let hasEnoughEntitledProducts = hasEnoughProductsForBuyXGetY(req, items, requiredEntitledProductIds, requiredEntitledQty);

        if (!hasEnoughEntitledProducts) return false;            
    }

    if (entitledItemType == 'collection') {
        let requiredEntitledCollectionIds = priceRule.entitled_collection_ids;

        let hasEnoughEntitledProductsFromSpecificCollections = await hasEnoughProductsFromSpecificCollectionsForBuyXGetY(req, items, requiredEntitledCollectionIds, requiredEntitledQty);

        if (!hasEnoughEntitledProductsFromSpecificCollections) return false;
    }

    return true;
}


async function hasMetPrerequisiteProductPurchaseAmountForBuyXGetY(req, items, requiredProductIds, requiredPurchaseAmount) {
    let itemsThatMatchWithRequiredProducts = items.filter(item => requiredProductIds.includes(Number(item.product_id)));
    if (!itemsThatMatchWithRequiredProducts.length) return false;

    let meetPrerequisiteProductPurchaseAmount = await Promise.all(items
            .map(async (item) => await req.shopify.productVariant.get(item.variant_id).then(data => Number(data.price) * Number(item.quantity)))
        ).then(itemTotalArray => itemTotalArray.reduce((accumulator, currentValue) => accumulator + currentValue))
        >= requiredPurchaseAmount
        ? true
        : false;

    return meetPrerequisiteProductPurchaseAmount;

}

async function hasMetPrerequisiteCollectionPurchaseAmountForBuyXGetY(req, items, requiredCollectionIds, requiredPurchaseAmount) {
    let itemsThatMatchWithRequiredProductCollections = await Promise.all(items
            .filter(async (item) => {
                item['collections'] = []
                let collections = await req.shopify.collect.list({
                    product_id: item.product_id
                })

                let smartCollections = await req.shopify.smartCollection.list({
                    product_id: item.product_id
                })

                collections.map(collect => item['collections'].push(collect.collection_id));
                smartCollections.map(collect => item['collections'].push(collect.id));

                let isThisItemHasRequiredCollection = requiredCollectionIds.some(collectId => item['collections'].includes(collectId));

                if (isThisItemHasRequiredCollection) return true;

                return false;
            })
        )

    if (!itemsThatMatchWithRequiredProductCollections.length) return false;

    let meetPrerequisiteCollectionPurchaseAmount = await Promise.all(itemsThatMatchWithRequiredProductCollections
            .map(async (item) => await req.shopify.productVariant.get(item.variant_id).then(data => Number(data.price) * Number(item.quantity)))
        ).then(itemTotalArray => itemTotalArray.reduce((accumulator, currentValue) => accumulator + currentValue))
        >= requiredPurchaseAmount
        ? true
        : false;

    return meetPrerequisiteCollectionPurchaseAmount;
}

async function hasEnoughProductsFromSpecificCollectionsForBuyXGetY(req, items, requiredCollectionIds, requiredProducQty) {
    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        item['collections'] = [];

        let collections = await req.shopify.collect.list({
            product_id: item.product_id
        })

        let smartCollections = await req.shopify.smartCollection.list({
            product_id: item.product_id
        })

        collections.map(collect => item['collections'].push(collect.collection_id));
        smartCollections.map(collect => item['collections'].push(collect.id));
    }

    let itemsWithQty = items
        .filter(item => 
            item.collections
            .filter(collect => requiredCollectionIds.includes(collect)))
        .map(item => Number(item.quantity));

    if (!itemsWithQty.length) return false;

    let hasEnoughProductFromSpecificCollections = itemsWithQty
        .reduce((accumulator, currentValue) => accumulator + currentValue)
        - requiredProducQty
        >= 0
        ? true
        : false;

    return hasEnoughProductFromSpecificCollections;
}

function hasEnoughProductsForBuyXGetY(req, items, requiredProductIds, requiredProductQty) {
    let itemsWithQty = items
        .filter(item => requiredProductIds.includes(Number(item.product_id)))
        .map(item => Number(item.quantity))

    // no item is matched, return
    if (!itemsWithQty.length) return false;

    // has matched items, check if qty meets requirement
    let hasEnoughProducts = itemsWithQty
        .reduce((accumulator, currentValue) => accumulator + currentValue)
        - requiredProductQty
        >= 0 
        ? true
        : false;

    return hasEnoughProducts;
}


function getBuyXGetYType(priceRule) {
    let type;

    if (priceRule.prerequisite_to_entitlement_purchase.prerequisite_amount) {
        return type = 'purchase_amount';
    }

    if (priceRule.prerequisite_to_entitlement_quantity_ratio.prerequisite_quantity) {
        return type = 'quantity';
    }
}

async function canUseCodeForCurrentCartProducts(req, priceRule, items) {
    // target_selection can be all, or entitled
    if (priceRule.target_selection == 'all') return true;

    let forProductOrCollection = applyToProductOrCollection(priceRule);
    let itemIds = items.map(item => item.product_id);

    if (forProductOrCollection == 'product') {
        let hasTargetProduct = priceRule.entitled_product_ids.some(productId => itemIds.includes(productId.toString())) ? true : false;

        console.log(hasTargetProduct);
        return hasTargetProduct;
    }

    if (forProductOrCollection == 'collection') {
        let productCollections = [];

        for (let i = 0; i < itemIds.length; i++) {
            let id = itemIds[i];

            let collections = await req.shopify.collect.list({
                product_id: id
            })

            let smartCollections = await req.shopify.smartCollection.list({
                product_id: id
            })

            collections.forEach(collect => {
                productCollections.push(collect.collection_id);
            })

            smartCollections.forEach(collect => {
                productCollections.push(collect.collection_id);
            })
        }

        let hasTargetCollection = priceRule.entitled_collection_ids.some(collectId => productCollections.includes(collectId)) ? true : false;

        return hasTargetCollection;
    }
}

async function canUseCodeForCurrentCustomer(req, priceRule, customerId) {
    let canCurrentCustomerUsesCode;

    if (priceRule.customer_selection == 'all' || !customerId) return true;

    // the rule targets specific customers
    if (priceRule.prerequisite_customer_ids.length) {
        canCurrentCustomerUsesCode = priceRule.prerequisite_customer_ids.some(id => id == customerId);

        return canCurrentCustomerUsesCode;
    }

    // the rule targets specifc groups of customer
    if (priceRule.prerequisite_saved_search_ids.length) {
        let customerGroupsThatCanUseCode = priceRule.prerequisite_saved_search_ids;
        let groupsThatCurrentCustomerBelongTo = [];
        let canCurrentCustomerUsesCode = false;

        // get groups that this customer belong to
        for (let i = 0; i < customerGroupsThatCanUseCode; i++) {
            let groupId = customerGroupsThatCanUseCode[i];
            if (!groupId) break;

            let params = { limit: 250 };
            do {
                let customers = await req.shopify.customerSavedSearch.customers(groupId);

                if (customers.find(cust => cust.id == customerId)) {
                    groupsThatCurrentCustomerBelongTo.push(groupId);
                }

                params = customers.nextPageParameters;
            } while (params !== undefined);            

        }

        canCurrentCustomerUsesCode = customerGroupsThatCanUseCode.some(groupId => groupsThatCurrentCustomerBelongTo.includes(groupId));

        return canCurrentCustomerUsesCode;
    }

}

async function canMeetMinimumRequirement(req, priceRule, items, couponCode, customerId) {
    if (!priceRule.prerequisite_subtotal_range && !priceRule.prerequisite_quantity_range) return true;

    let applyType = applyToProductOrCollection(priceRule);
    let requirementType = getRequirementType(priceRule);

    if (requirementType == 'subtotal_minimum') {
        let requiredSubTotal = Number(priceRule.prerequisite_subtotal_range.greater_than_or_equal_to);
        let itemsTotal = 0;

        for (let i = 0; i < items.length; i++) {
            let item = await req.shopify.productVariant.get(items[i].variant_id);
            itemsTotal += Number(item.price * Number(items[i].quantity));
        }

        if (itemsTotal >= requiredSubTotal) return true;

        return false;
    }

    if (requirementType == 'qty_minimum') {
        let requiredQty = priceRule.prerequisite_quantity_range.greater_than_or_equal_to;
        let reducer = (accumulator, currentValue) => accumulator + currentValue;
        let itemsTotalQty = items.map(item => item.quantity).reduce(reducer);

        if (itemsTotalQty >= requiredQty) return true; 

        return false;
    }
}

function canUseCodeForCurrentDate(priceRule) {
    // no end date
    if (!priceRule.ends_at && moment() >= moment(priceRule.starts_at)) return true;

    // has end date
    if (moment() < moment(priceRule.ends_at)) return true;

    return false;
}

async function canMeetUsageLimits(req, priceRule, couponCode, customerId) {
    if (!priceRule.usage_limit && priceRule.once_per_customer == false) return true;

    // check for usage limit && once per customer
    if (priceRule.usage_limit && priceRule.once_per_customer) {

        if (priceRule.usage_limit && req.shopify.coupon['couponCode'].usage_count < priceRule.usage_limit && !await hasCustomerUsedThisCouponCode(req, customerId, couponCode)) return true;

        return false;
    }

    // check for once per customer
    if (priceRule.once_per_customer && !await hasCustomerUsedThisCouponCode(req, customerId, couponCode)) return true;

    // check for usage limit
    if (priceRule.usage_limit && req.shopify.coupon['couponCode'].usage_count < priceRule.usage_limit) return true;

    return false;
}

async function hasCustomerUsedThisCouponCode(req, customerId, couponCode) {
    let ordersFromThisCustomer = await req.shopify.customer.orders(customerId);
    let ordersWithCouponCode = ordersFromThisCustomer
        .filter(order => order.discount_applications.length > 0)
        .map(orderWithOnlyCouponCode => orderWithOnlyCouponCode.discount_applications[0].code.toLowerCase());

    // the input coupon code was used already by this customer
    if (ordersWithCouponCode.includes(couponCode.toLowerCase())) {
        return true;
    }

    return false;  
}



function getRequirementType(priceRule) {
    console.log('getting req.');


    if (priceRule.prerequisite_subtotal_range) {
        console.log(3);
        return 'subtotal_minimum';
    }

    if (priceRule.prerequisite_quantity_range) {
        return 'qty_minimum';
    }
} 

function applyToProductOrCollection(priceRule) {
    if (priceRule.entitled_product_ids.length) {
        return 'product';
    }

    if (priceRule.entitled_collection_ids.length) {
        return 'collection';
    }

    if (priceRule.target_selection == 'all') {
        return 'all';
    }
}


function getPriceRuleType(priceRule) {
    let type = '';

    if (priceRule.value_type == 'fixed_amount') {
        return type = 'fixed_amount';
    }

    if (priceRule.value_type == 'percentage' && priceRule.target_type == 'line_item' && priceRule.prerequisite_product_ids.length == 0 && priceRule.prerequisite_collection_ids.length == 0) {
        return type = 'percentage';
    }

    if (priceRule.prerequisite_product_ids.length || priceRule.prerequisite_collection_ids.length) {
        return type = 'buyXGetY';
    }

    if (priceRule.target_type == 'shipping_line') {
        return type = 'free_shipping';
    }
}


function calcItemFinalPrice(item){
    // final price
    item.final_price = item.discounted_price; 

    item.final_line_price = item.final_price * item.quantity;
    item.discount = item.original_price - item.discounted_price;
    item.line_discount = item.discount * item.quantity;
    return item;
}

function dollars2cents(dollars){
    return dollars * 100;
}

function cents2dollars(cents){
    return cents / 100;
}


module.exports = router;