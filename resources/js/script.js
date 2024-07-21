// var host, apiHost;

// if (window.location.href.includes('chris-development-store')) { // For Dev YSD whatsapp app
//     host = 'https://cbae-58-177-74-25.ngrok.io';
//     apiHost = 'https://cbae-58-177-74-25.ngrok.io/api';
// } else { // For Live YSD whatsapp app
//     host = 'https://shopapp.discount.ysd.hk';
//     apiHost = 'https://shopapp.discount.ysd.hk/api';
// }

// window.ysdWhatsappApp = {
//     host: host,
//     apiHost: apiHost,
//     apiUrl: function (path) {
//         return this.apiHost + path;
//     },
//     loading: false,
//     loadScripts: function(){
//         var scriptUrls = [];
//         if (!window.jQuery) {
//             scriptUrls.push('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js');
//         }
//         if (!window._ || !window._.map) {
//             scriptUrls.push('https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js');
//         }

//         var promises = [];
//         for(var i = 0; i < scriptUrls.length; i++){
//             promises.push(this.loadScript(scriptUrls[i]));
//         }

//         return Promise.all(promises);
//     },
//     loadScript: function (url) {
//         console.log(url); 
//         return new Promise(function(resolve, reject){
//             var head = document.head;
//             var script = document.createElement('script');
//             script.type = 'text/javascript';
//             script.src = url;
//             script.onreadystatechange = resolve;
//             script.onload = resolve;
//             head.appendChild(script);
//         });
//     },


//     init: function () {
//         var self = this;

//         console.log('has scripttag');
    
//         this.loadScripts().then(function(){
//             self.start();
//         });
//     },
//     start: function () {
//         this.addCss();
//         this.jqueryHelper();
//     },


//     addCss: function(){
//         jQuery('head').append('<link rel="stylesheet" type="text/css" href="' + this.host + '/resources/css/style.css">');
//     },

//     jqueryHelper: function(){
//         jQuery.extend(jQuery.expr[':'], {
//             attrContain: function (el, i, props) {

//                 var hasAttribute = false;

//                 jQuery.each(el.attributes, function (i, attr) {
//                     if (attr.value.indexOf(props[3]) !== -1) {
//                         hasAttribute = true;
//                         return false;  // to halt the iteration
//                     }
//                 });

//                 return hasAttribute;
//             }
//         });
//     }
// }

// ysdWhatsappApp.init();
