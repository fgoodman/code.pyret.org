$(function() {
  // NOTE(joe): including repl-ui is some load-order BS to figure out
  require(["/js/repl-ui.js", "/js/web-runner.js",
  "/js/editor-find-module.js"], function(_, webRunner,
  find) {
    // TODO(all): Move createPCAPI to a require module.
    var storageAPIP = createProgramCollectionAPI(
      clientId, apiKey, "code.pyret.org", false);

    var proxy = function(s) {
      return APP_BASE_URL + "/downloadImg?" + s;
    };
    var makeFind = find.createFindModule(null);
    var runnerP = webRunner.createRunner(proxy, makeFind);
    var resultP = Q.all([runnerP, storageAPIP]).spread(
      function(runner, storageAPI) {
        var fileP = storageAPI.api.getFileById("0B-_f7M_B5NMiV0M2ckNhTE5FdGc");
        return fileP.then(function(file) {
          return file.getContents().then(function(contents) {
            return runner.runString(contents, "test");
          });
        });
      });
    resultP.then(function(result) { console.log(result); });
    resultP.fail(function(exn) { console.log(exn); });
  });
});
