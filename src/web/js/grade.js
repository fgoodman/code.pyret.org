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
        var req = function() {
          var throttle = false;
          var delay = 1.0;
          return function(thunk) {
            while (true) {
              var resultP = gQ(thunk()).then(function(result) {
                console.log(result);
                if (result.code === undefined) {
                  return result;
                }
                else {
                  return null;
                }
              });
              
              if (resultP !== null) {
                return resultP;
              }
              else {
                if (delay > 16) return null;
                var init = new Date().getTime();
                var wait = delay * 1000 + Math.floor(Math.random() * 1000);
                console.error("Waiting " + wait + "ms before retry...");
                while (init + wait > new Date().getTime()) {}
                delay = delay * 2;
              }
            }
          };
        }();
        
        function req(thunk) {
          var delay = 1.0;
          var repeat = false;
          do {
            var res = gQ(thunk()).then(function(result) {
              repeat = false;
              return result;
            }).fail(function(error) {
              if (error.err.code === 403) {
                var start = new Date().getTime();
                var wait = Math.floor((delay + Math.random()) * 1000);
                while (start + wait > new Date().getTime()) {};
                repeat = true;
                delay = delay * 2;
                return error;
              }
              else {
                repeat = false;
                return error;
              }
            });
          } while (repeat && delay < 16);

          return res;
        }

        function req(thunk, wait) {
          var start = new Date().getTime();
          while (start + wait > new Date().getTime()) {}
          return thunk().then(function(res) {
            console.log(res);
            return res;
          }).fail(function(err) {
            return req(thunk, wait + 1000 + Math.floor(1000 * Math.random()));
          });
        }

        var throttle = false;
        var wait = 0;
        function req(thunk) {
          console.log(wait);
          return thunk().then(function(res) {
            if (wait > 0) wait -= 100;
            else throttle = false;
            return res;
          }).fail(function(err) {
            if (wait == 0) wait = 900;
            wait += 100;
            throttle = true;
            var start = new Date().getTime();
            while (start + wait > new Date().getTime()) {}
            return req(thunk);
          });
        }
      */

        var nextWait = 0;
        function req(thunk) {
          var deferred = Q.defer();

          function req_(thunk) {
            thunk().then(function(res) {
              if (nextWait > 0) nextWait -= 100;
              console.log("Resolving with", res);
              deferred.resolve(res);
            }).fail(function(err) {
              if (nextWait == 0) nextWait = 900;
              nextWait += 100;
              //console.log("Waiting for " + nextWait + "ms...");
              setTimeout(function () {
                req_(thunk);
              }, nextWait);
            });
          }
          req_(thunk);

          return deferred.promise;
        }

        /*
         * getFiles : String -> P([File])
         * Consumes a gDrive ID and produces a promise to an array of files.
         */
        function getFiles(id) {
          var childrenThunk = function() {
            return gQ(drive.children.list({folderId: id}));
          };
          return req(childrenThunk)
            .then(function(directory) {
              console.log(id, directory);
              return Q.all(directory.items.map(function(file) {
                var filesThunk = function() {
                  return gQ(drive.files.get({fileId: file.id}));
                };
                return req(filesThunk)
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
              console.log(student, student.getUniqueId());
              var name = student.getName();
              return getFiles(student.getUniqueId()).then(function(dirs) {
                return dirs.find(function(dir) {
                  return dir.getName() == "submission";
                });
              }).then(function(dir) {
                /*
                 * TODO(fgoodman): Remove gremlin files with preprocessing
                 * and remove this conditional (and below as well).
                 */
                if (dir !== undefined) {
                  return getFiles(dir.getUniqueId());
                }
                else {
                  return null;
                }
              }).then(function(files) {
                console.log(name, files);
                if (files)
                  submissions[name] = files;
                return files;
              })
            }))
          }).then(function() {
            deferred.resolve(submissions);
          });

          return deferred.promise;
        }

        function filterSubmissions(submissions, names) {
          return Object.keys(submissions).reduce(function(o, i) {
            o[i] = submissions[i].reduce(function(base, file) {
              if (names.indexOf(file.getName()) >= 0)
                base[file.getName()] = file;
              return base;
            }, {});
            return o;
          }, {});
        }


        function runAll(submissions, names, name) {
          renderSubmissions(submissions, names, false);

          $.each(submissions, function(name, files) {
            console.log(name, files);
            files[name].file;
          });

          renderSubmissions(submissions, names, true);
        }

        function generateRunHtml(submissions, student, files, names, enabled) {
          var t = $("<td><div class=\"pure-menu\"><ul class=\"" +
              "pure-menu-list\"><li class=\"pure-menu-item " +
              "pure-menu-allow-hover pure-menu-has-children\">" +
              "</li></ul></div></td>");
          if (!enabled) {
            t.find("li").first()
              .addClass("pure-menu-disabled").text("Run");
            return t;
          }
          t.find("li").first().html(
                 "<a href=\"#\" " +
                 "class=\"pure-menu-link\">Run</a><ul class=\"" +
                 "pure-menu-children\"></ul></li></ul></div></td>");
          var st = t.find(".pure-menu-children").first();
          $.each(names, function(_, name) {
            var ss = $("<li class=\"pure-menu-item\"></li>");
            if (name in files) {
              ss.append($("<a class=\"pure-menu-link\" href=\"#\">").text(name)
                .on("click", function() {
                  renderSubmissions(submissions, names, false);
                  console.log(files[name]);
                  files[name].getContents().then(function(contents) {
                    return runner.runString(contents, "");
                  }).then(function(result) {
                    submissions[student][name].result = result;
                    return renderSubmissions(submissions, names, true);
                  });
                }));
            }
            else {
              ss.addClass("pure-menu-disabled")
              ss.append($("<div>").css("white-space", "nowrap").text(name));
            }
            st.append(ss);
          });

          return t;
        }

        function generateResultHtml(files) {
          var t = $("<td>");

          $.each(Object.keys(files).sort(), function(_, name) {
            if (files[name].result !== null) {
              console.log(name, files[name].result);
              t.append("<em>" + name + ":</em> " + files[name].result);
            }
          });

          return t;
        }

        function generateSubmissionHtml(submissions, name, names, enabled) {
          var t = $("<tr>");
          t.append("<td>" + name + "</td>");

          t.append(generateRunHtml(
                submissions, name, submissions[name], names, enabled));
          t.append(generateResultHtml(submissions[name]));

          return t;
        }

        function renderSubmissions(submissions, names, enabled) {
          $("#students-loading").hide();
          var t = $("#students");
          t.html("");

          t.append(
              "<thead><tr><th>Student</th><th>Files</th>" +
              "<th>Results</th></tr></thead>");

          $.each(Object.keys(submissions).sort(), function(_, name) {
            t.append(generateSubmissionHtml(
                submissions, name, names, enabled));
          });
        }

        var submissionsID = "0B-_f7M_B5NMiQjFLeEo1SVBBUE0";
        var names = ["list-drill-code.arr", "list-drill-tests.arr"].sort();

        gatherSubmissions(submissionsID).then(function(submissions) {
          console.log(submissions);
          var submissions = filterSubmissions(submissions, names);
          renderSubmissions(submissions, names, true);
        }).fail(function(f) { console.log(f); });
      });
  });
});
