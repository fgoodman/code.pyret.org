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
         * batchGet : [String] -> P([{File, Status}])
         * Consumes an array of gDrive IDs and produces a promise to an array
         * of objects containing files and status codes.
         */
        function batchGet(ids) {
          function xhrToData(xhr) {
            var lines = xhr.split("\r\n");
            var boundary = lines[0];
            var data = [];
            var d = null;
            $.each(lines, function(i, l) {
              if (l.length) {
                if (l.indexOf(boundary) == 0) {
                  if (d) data.push(fileBuilder(d));
                  d = {};
                }
                else if (d) {
                  try {
                    d = JSON.parse(l);
                  }
                  catch(e) {

                  }
                }
              }
            });

            return data;
          }

          var boundary = +new Date;
          function idsToData(ids) {
            var body = [];

            for (var i = 0; i < ids.length; i++) {
              body.push("--" + boundary);
              body.push("Content-Type: application/http");
              body.push("Content-ID: <item" + i + ":user@example.com>");
              body.push("Content-Transfer-Encoding: binary");
              body.push(""); body.push("");
              body.push("GET /drive/v2/files/" + ids[i]);
              body.push(""); body.push("");
            }

            body.push("--" + boundary + "--", "");

            return body.join("\r\n");
          }

          return Q($.ajax({
            type: "POST",
            url: "https://www.googleapis.com/batch",
            headers: {
              "Content-Type": "multipart/mixed; boundary=" + boundary,
              "Authorization": "Bearer " + gapi.auth.getToken().access_token
            },
            data: idsToData(ids)
          })).then(function(xhr) {
            console.log(xhrToData(xhr));
            return xhrToData(xhr);
          });
        }

        /*
         * getFiles : String -> P([File])
         * Consumes a gDrive ID and produces a promise to an array of files.
         */
        function getFiles(id) {
          return gQ(drive.children.list({folderId: id}))
            .then(function(directory) {
              return Q.all(batchGet(directory.items.map(function(file) {
                return file.id;
              })));
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
                if (dir !== undefined)
                  return getFiles(dir.getUniqueId());
                else
                  return null;
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
                base[file.getName()] = {file: file, result: null};
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
                  files[name].file.getContents().then(function(contents) {
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
          var submissions = filterSubmissions(submissions, names);
          renderSubmissions(submissions, names, true);
          runAll(submissions, names, names[0]);
        }).fail(function(f) { console.log(f); });
      });
  });
});
