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
    var makeFind = find.createFindModule(storageAPIP);
    var runnerP = webRunner.createRunner(proxy, makeFind);

    var resultP = Q.all([runnerP, storageAPIP]).spread(
      function(runner, storageAPI) {
        var gQ = storageAPI.gQ;
        var drive = storageAPI.drive;
        var fileBuilder = storageAPI.fileBuilder;

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

        function getFile(id) {
          var filesThunk = function() {
            return gQ(drive.files.get({fileId: id}));
          };
          return req(filesThunk).then(fileBuilder);
        }

        function getFiles(id) {
          var childrenThunk = function() {
            return gQ(drive.children.list({folderId: id}));
          };
          return req(childrenThunk)
            .then(function(directory) {
              return Q.all(directory.items.map(function(file) {
                return getFile(file.id);
              }));
            });
        }

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
/*
        function generateResultJSON(runtime, result) {
          var o = {};
          if (runtime.isSuccessResult(result)) {
            if (runtime.ffi.isRight(result.result)) {
              
              var checks = runtime.ffi.toArray(
                runtime.getField(runtime.getField(result.result, "v")
                  .val.result.result, "checks"));
              console.log(checks);

              function toObject(test) {
                return {
                  isSuccess: test.$name == "success",
                  result: test.$name,
                  code: runtime.getField(test, "code"),
                  loc: runtime.getField(test, "loc").dict
                };
              }

              for (var i = 0; i < checks.length; i++) {
                o[runtime.getField(checks[i], "name")] =
                  runtime.ffi.toArray(runtime.getField(
                      checks[i], "test-results")).map(toObject);
              }

              return o;
            }
            else {
              console.log("left", result);
            }
          }
          else {
            console.log("Not SuccessResult");
          }
        }


*/
        function makeTarget(submissions, target) {
          return function() {
            var targetTD = $(this);
            targetTD.removeClass("def").css("background-color", "#f7cb2a");
            $("#tbl td.def, #tbl th.def").addClass("dis").removeClass("def");
            target.eval(function(result) {
              console.log(result);
              targetTD.addClass("fin");
              targetTD.css("background-color", "#30ba40");
              $("#tbl td.dis, #tbl th.dis").addClass("def").removeClass("dis");
            });
          };
        }

        function runTDs(tds) {
          var i = 0;
          var interval = setInterval(function() {
            if (i < tds.length) {
              if (tds.eq(i).hasClass("def")) {
                tds.eq(i).click();
              }
              if (tds.eq(i).hasClass("fin")) {
                i++;
              }
            }
            else {
              clearInterval(interval);
            }
          }, 50);
        }

        function renderSubmissions(submissions) {
          var thead = $("#tbl thead tr");
          thead.append("<th>student</th>");
          var colspan = 0;
          for (var student in submissions) {
            if (submissions.hasOwnProperty(student) &&
                submissions[student] !== null) {
              for (; colspan < submissions[student].length; colspan++) {
                var target = submissions[student][colspan];
                console.log(colspan); 
                thead.append($("<th>").text(target.name).addClass("def").click(
                    function() {
                      runTDs($(this).parent().parent().parent().find(
                          "td:not(.nohov):nth-child(" + $(this).index() + ")"));
                    }));
              }
              break;
            }
          }

          var tbody = $("#tbl tbody");
          tbody.css("height", $("#cfg").height() - thead.height());
          for (var student in submissions) {
            if (submissions.hasOwnProperty(student)) {
              var tr = $("<tr>");
              var td = $("<td>").text(student);
              if (submissions[student] !== null) {
                for (var i = 0; i < submissions[student].length; i++) {
                  tr.append($("<td>").addClass("def").click(
                        makeTarget(submissions, submissions[student][i])));
                }
                tr.prepend(td.addClass("def").click(
                    function() {
                      runTDs($(this).parent().find("td:not(:first-child)"));
                    }));
              }
              else {
                tr.append(td.addClass("nohov"));
                tr.append($("<td>").attr("colspan", colspan).addClass("nohov"));
              }
              tbody.append(tr);
            }
          }
        }

        function getSubmission(submission, name) {
          for (var i = 0; i < submission.length; i++) {
            if (submission[i].getName() == name) {
              return submission[i];
            }
          }
          
          return null;
        }

        function makeRunner(fileObj, fileName, fileID) {
          if (fileObj !== null) {
            return function(thunk) {
              return fileObj.getContents().then(function(contents) {
                var subs = {};
                subs[fileName] = fileID;
                return runner.runString(contents, "", subs);
              }).then(thunk);
            };
          }
          else {
            return null;
          }
        }

        function loadAndRenderSubmissions() {
          $("#cfg-container").hide();
          $(".pure-u-1").show();

          var assignmentID = $("#id").val();
          var implName = $("#implementation").val();
          var testName = $("#test").val();
          var suiteID = $("#suite").val();
          var goldID = $("#gold").val();
          var coals;
          if ($("#coals").val() === "") {
            coals = [];
          }
          else {
            coals = $("#coals").val().split("\n").map(function(coal) {
              return coal.split(":");
            });
          }

          getFile(suiteID).then(function(suiteSubmission) {
            function toTargets(submission) {
              var targets = [];
              var implSubmission = getSubmission(submission, implName);
              var testSubmission = getSubmission(submission, testName);
              if (testSubmission !== null && implSubmission !== null) {
                targets.push({
                  name: "test",
                  eval: makeRunner(
                    suiteSubmission, implName, implSubmission.getUniqueId())
                });
                targets.push({
                  name: "gold",
                  eval: makeRunner(testSubmission, implName, goldID)
                });
                for (var i = 0; i < coals.length; i++) {
                  targets.push({
                    name: "coal-" + i,
                    eval: makeRunner(testSubmission, coals[i][0], coals[i][1])
                  });
                }
                return targets;
              }
              else {
                return null;
              }
            }

            gatherSubmissions(assignmentID).then(function(submissions) {
              for (var student in submissions) {
                if (submissions.hasOwnProperty(student)) {
                  submissions[student] = toTargets(submissions[student]);
                }
              }

              renderSubmissions(submissions);
            }).fail(function(f){console.log(f);});
          });
        }

        $("#load").click(loadAndRenderSubmissions);

      });
  });
});
