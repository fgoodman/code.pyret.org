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
        var gQ = storageAPI.gQ;
        var drive = storageAPI.drive;
        var fileBuilder = storageAPI.fileBuilder;

        /*
         * getFiles : String -> P([File])
         * Consumes a gDrive ID and produces a promise to an array of files.
         */
        function getFiles(id) {
          return gQ(drive.children.list({folderId: id}))
            .then(function(directory) {
              return Q.all(directory.items.map(function(file) {
                return gQ(drive.files.get({fileId: file.id}))
                  .then(fileBuilder);
                }));
              });
        }

        /*
         * gatherSubmissions : String -> P(Object(String -> [File]))
         * Consumes a gDrive ID and produces a promise to an object with
         * student names as keys and arrays of files as values.
         */
        function gatherSubmissions(id) {
          var deferred = Q.defer();
          var submissions = {};

          getFiles(id).then(function(students) {
            return Q.all(students.map(function(student) {
              return (function(name) { // Closure for scoping name.
                return getFiles(student.getUniqueId()).then(function(dirs) {
                  return dirs.find(function(dir) {
                    return dir.getName() == "submission";
                  });
                }).then(function(dir) {
                  /*
                   * TODO(fgoodman): Remove gremlin files with preprocessing
                   * and remove this conditional (and below as well).
                   */
                  if (dir !== undefined)
                    return getFiles(dir.getUniqueId());
                  else
                    return null;
                }).then(function(files) {
                  if (files)
                    submissions[name] = files;
                  return files;
                })
              })(student.getName());
            }))
          }).then(function() {
            deferred.resolve(submissions);
          });

          return deferred.promise;
        }

        var submissionsID = "0B-_f7M_B5NMiQjFLeEo1SVBBUE0";

        gatherSubmissions(submissionsID).then(function(a) {
          console.log(a);
        });
      });
  /*
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
    */
  });
});
