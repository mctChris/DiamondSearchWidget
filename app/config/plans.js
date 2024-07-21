const plans = [
    {
        code: "basic",
        title: "Basic Shopify",
        monthlyPrice: 9,
        description: "This plan includes Tiered Discount and is for merchants with Basic Shopify plan ($29/mo).",
        scopes: ['tiered', 'crosssell', 'quantity'],
        shopifyPlan: ["basic"]
    },
    {
        code: "professional",
        title: "Shopify",
        monthlyPrice: 19,
        description: "This plan includes Tiered Discount and is for merchants with Shopify plan ($79/mo).",
        scopes: ['tiered', 'crosssell', 'quantity'],
        shopifyPlan: ["professional"]
    }
];
  
module.exports = plans;