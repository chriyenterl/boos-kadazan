ObjC.import("Foundation");
var html = $.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments.objectAtIndex(4)), $.NSUTF8StringEncoding, null).js;
var src = '(function' + html.split('<script>\n(function')[1].split('</script>')[0];
(new Function(src))();
var K = globalThis.__KZ, texts = {};
K.ALL_ITEMS.forEach(function (it) { [it.kz].concat(it.alt || []).forEach(function (t) { texts[t] = 1; }); K.tokens(it.kz).forEach(function (w) { texts[w] = 1; }); });
texts['Kounsikaan!'] = 1;
JSON.stringify(Object.keys(texts));
