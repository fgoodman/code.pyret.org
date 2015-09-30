$(function() {
  // NOTE(joe): including repl-ui is some load-order BS to figure out
  require(["/js/repl-ui.js", "/js/web-runner.js",
  "/js/editor-find-module.js"], function(_, webRunner,
  find) {
    var proxy = function(s) {
      return APP_BASE_URL + "/downloadImg?" + s;
    };
    var makeFind = find.createFindModule(null);
    var runnerP = webRunner.createRunner(proxy, makeFind);
    var resultP = runnerP.then(function(runner) {
      return runner.runString("print(link(1, empty))", "test");
    });
    resultP.then(function(result) { console.log(result); });
    resultP.fail(function(exn) { console.log(exn); });
  });
});
