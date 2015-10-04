$(function() {
  // NOTE(joe): including repl-ui is some load-order BS to figure out
  require(["/js/repl-ui.js", "/js/web-runner.js",
  "/js/editor-find-module.js"], function(_, webRunner,
  find) {
    var assignmentName = "learning-pyret";
    var codeName = "list-drill-code.arr";

    // TODO(all): Move createPCAPI to a require module.
    var storageAPIP = createProgramCollectionAPI(
      clientId, apiKey, "learning-pyret", false);

    var proxy = function(s) {
      return APP_BASE_URL + "/downloadImg?" + s;
    };
    var makeFind = find.createFindModule(null);
    var runnerP = webRunner.createRunner(proxy, makeFind);
    var resultP = Q.all([runnerP, storageAPIP]).spread(
      function(runner, storageAPI) {
        return storageAPI.api.getAllFiles(false).then(function(dirs) {
          return dirs.map(function(d) {
            return storageAPI.api.getAllFilesById(d.id, true).then(function(files) {
              var found = files.filter(function(f) {
                return f.getName() == codeName
              });
              if (found && found.length > 0) {
                return found[0].getContents().then(function(contents) {
                  return runner.runString(contents, "test");
                });
              }
              else {
                throw new Error("File not found.");
              }
            });
          });
        });
      });
    resultP.then(function(result) {
      for (i = 0; i < result.length; i++) {
        result[i].then(function(r) {
          console.log(r); 
        });
      }
    });
    resultP.fail(function(exn) { console.log(exn); });
  });
});
