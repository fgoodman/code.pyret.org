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
      ]
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
              o[i][target.name] = $.extend({}, submissions[i][target.file]);
              if (o[i][target.name] !== undefined)
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
            target, student, submissions, targets) {
          var item = $("<li class=\"pure-menu-item\"></li>");
          if (submissions[student][target.name] !== undefined) {
            item.append(
                $("<a class=\"pure-menu-link\" href=\"#\">").text(target.name)
              .on("click", function() {
                renderSubmissions(submissions, targets, false);
                submissions[student][target.name].getContents().then(
                  function(contents) {
                  return runner.runString(contents, "", target.subs);
                  }).then(function(result) {
                    submissions[student][target.name].result = result;
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
          $.each(targets, function(_, target) {
            st.append(
              generateRunItemHtml(target, student, submissions, targets));
          });

          return t;
        }

        function generateResultHtml(targets) {
          var t = $("<td>");

          $.each(Object.keys(targets).sort(), function(_, name) {
            if (targets[name] !== undefined && targets[name].result !== null) {
              if (targets[name].result !== undefined)
                console.log(name, targets[name].result);
              t.append("<em>" + name + ":</em> " + targets[name].result);
            }
          });

          return t;
        }

        function generateSubmissionHtml(submissions, name, targets, enabled) {
          var t = $("<tr>");
          t.append("<td>" + name + "</td>");

          t.append(generateRunHtml(
                submissions, name, targets, enabled));
          t.append(generateResultHtml(submissions[name]));

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
        gatherSubmissions(config.assignment).then(function(submissions) {
          var submissions = filterSubmissions(submissions, files);
          submissions = convertSubmissions(submissions, config.targets);
          renderSubmissions(submissions, config.targets, true);
        }).fail(function(f) { console.log(f); });
      });
  });
});
