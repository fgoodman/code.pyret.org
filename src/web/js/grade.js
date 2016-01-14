$(function() {
  // NOTE(joe): including repl-ui is some load-order BS to figure out
  require(["/js/repl-ui.js", "/js/web-runner.js",
  "/js/editor-find-module.js"], function(_, webRunner,
  find) {

    var config = {
      assignment: "0B-_f7M_B5NMiQjFLeEo1SVBBUE0",
      files: [
        "list-drill-code.arr",
        "list-drill-tests.arr"
      ],
      targets: [
        {
          name: "list-drill-code.arr",
          file: "list-drill-code.arr",
          subs: {}
        },
        {
          name: "list-drill-tests.arr",
          file: "list-drill-tests.arr",
          subs: {}
        },
        {
          name: "gold",
          file: "list-drill-tests.arr",
          subs: {
            "list-drill-code.arr": "0B-_f7M_B5NMiZ1dJclRWMGN3ZTg"
          }
        }
      ],
      testTarget: {
        name: "test-suite",
        target: "list-drill-code.arr",
        id: "0B-_f7M_B5NMiZ1dJclRWMGN3ZTg"
      }
    };

    // TODO(all): Move createPCAPI to a require module.
    var storageAPIP = createProgramCollectionAPI(
      clientId, apiKey, "code.pyret.org", false);

    var proxy = function(s) {
      return APP_BASE_URL + "/downloadImg?" + s;
    };
    var makeFind = find.createFindModule(storageAPIP);
    var runnerP = webRunner.createRunner(proxy, makeFind);

    var resultP = Q.all([runnerP, storageAPIP]).spread(
      function(runner, storageAPI) {
        var gQ = storageAPI.gQ;
        var drive = storageAPI.drive;
        var fileBuilder = storageAPI.fileBuilder;

        /*
         * req : Thunk(P) -> P
         * Consumes a thunk returning a promise to a Drive API result and
         * returns a promise to the result of the API call. Note the API call
         * must be valid.
         */
        var nextWait = 0;
        function req(thunk) {
          var deferred = Q.defer();

          function req_(thunk) {
            thunk().then(function(res) {
              if (nextWait > 0) nextWait -= 100;
              deferred.resolve(res);
            }).fail(function(err) {
              if (nextWait == 0) nextWait = 900;
              nextWait += 100;
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

        function addTestSuite(submissions, target) {
          return req(function() {
            return gQ(drive.files.get({fileId: target.id}));
          })
            .then(fileBuilder)
            .then(function(file) {
              var keys = Object.keys(submissions);
              for (var i = 0; i < keys.length; i++) {
                var s = submissions[keys[i]];
                if (s[target.target].getUniqueId !== undefined) {
                  s["test-suite"] = $.extend({}, file);
                  s["test-suite"].subs = {};
                  s["test-suite"].subs[target.target] = s[target.target].getUniqueId();
                }
                else {
                  s["test-suite"] = undefined;
                }

              }
              return submissions;
            }).fail(function(f) { console.log(f); });
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

        function convertSubmissions(submissions, targets) {
          return Object.keys(submissions).reduce(function(o, i) {
            o[i] = {};
            for (var j = 0; j < targets.length; j++) {
              var target = targets[j];
              o[i][target.name] = {};
              o[i][target.name] = $.extend({}, submissions[i][target.file]);
              o[i][target.name].subs = target.subs;
            }
            return o;
          }, {});
        }


        // Not yet used.
        function runAll(submissions, targets, name) {
          renderSubmissions(submissions, targets, false);

          $.each(submissions, function(name, targets) {
            console.log(name, targets);
          });

          renderSubmissions(submissions, targets, true);
        }

        function generateRunItemHtml(
            name, student, submissions, targets) {
          var item = $("<li class=\"pure-menu-item\"></li>");
          if (submissions[student][name] !== undefined && submissions[student][name]._googObj !== undefined) {
            item.append(
                $("<a class=\"pure-menu-link\" href=\"#\">").text(name)
              .on("click", function() {
                renderSubmissions(submissions, targets, false);
                submissions[student][name].getContents().then(
                  function(contents) {
                  return runner.runString(
                    contents, "", submissions[student][name].subs);
                  }).then(function(result) {
                    submissions[student][name].result = result;
                    return renderSubmissions(submissions, targets, true);
                  });
              }));
          }
          else {
            item
              .addClass("pure-menu-disabled")
              .append($("<div>")
              .css("white-space", "nowrap")
              .text(name));
          }

          return item;
        }

        function generateRunHtml(submissions, student, targets, enabled) {
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
          for (var i = 0; i < targets.length; i++) {
            var name = targets[i];
            st.append(
              generateRunItemHtml(name, student, submissions, targets));
          }

          return t;
        }

        function generateResultHtml(submission, targets) {
          var t = $("<td>");

          for (var i = 0; i < targets.length; i++) {
            var name = targets[i];
            if (name in submission && submission[name] !== null) {
              if (submission[name] !== undefined) {
                t.append("<em>" + name + ":</em> " + submission[name].result);
                if (submission[name].result !== undefined)
                  console.log(name, submission[name].result);
              }
              else {
                t.append("<em>" + name + ":</em> undefined");
              }
            }
          }

          return t;
        }

        function generateSubmissionHtml(submissions, name, targets, enabled) {
          var t = $("<tr>");
          t.append("<td>" + name + "</td>");

          t.append(generateRunHtml(
                submissions, name, targets, enabled));
          t.append(generateResultHtml(submissions[name], targets));

          return t;
        }

        function renderSubmissions(submissions, targets, enabled) {
          $("#students-loading").hide();
          var t = $("#students");
          t.html("");

          t.append(
              "<thead><tr><th>Student</th><th>Files</th>" +
              "<th>Results</th></tr></thead>");

          $.each(Object.keys(submissions).sort(), function(_, name) {
            t.append(generateSubmissionHtml(
                submissions, name, targets, enabled));
          });
        }

        var files = config.files.sort();
        var targets = config.targets.map(function(target) {
          return target.name;
        });
        gatherSubmissions(config.assignment).then(function(submissions) {
          var submissions = filterSubmissions(submissions, files);
          submissions = convertSubmissions(submissions, config.targets);
          if (config.testTarget !== undefined) {
            addTestSuite(submissions, config.testTarget).then(
              function(submissions) {
                targets.push("test-suite");
                renderSubmissions(submissions, targets, true);
              })
            .fail(function(f) { console.log(f) });
          }
          else {
            renderSubmissions(submissions, targets, true);
          }
        }).fail(function(f) { console.log(f); });
      });
  });
});
