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
                base[file.getName()] = file;
              return base;
            }, {});
            return o;
          }, {});
        }

        function runFile(caller, contentsP) {
          if (!caller.hasClass("run")) {
            alert("Please wait for the first file to finish running.");
            return;
          }

          $(".run").addClass("run-disabled").removeClass("run");

          contentsP.then(function(contents) {
            return runner.runString(contents, "");
          }).then(function(result) {
            console.log(result);
            $(".run-disabled").addClass("run").removeClass("run-disabled");
          });
        }

        function renderSubmissions(submissions) {
          $("#students-loading").hide();
          var table = $("#students");
          table.append(
              "<thead><tr><th>Student</th><th>Files</th>" +
              "<th>Result</th></tr></thead>");
          $.each(Object.keys(submissions).sort(), function(_, name) {
            var div = $("<div>").addClass("pure-menu");
            var ul = $("<ul>").addClass("pure-menu-list");
            var li = $("<li>").addClass("pure-menu-item pure-menu-allow-hover" +
              " pure-menu-has-children");
            var a = $("<a>").attr("href", "#").attr("id", "menuLink1").addClass(
              "pure-menu-link").text("Run");
            li.append(a);
            var list = $("<ul>").addClass("pure-menu-children");
            var files = submissions[name];
            $.each(names, function(_, k) {
              var fli = $("<li>").addClass("pure-menu-item");
              var flink = $("<a>")
                .attr("href", "#")
                .addClass("pure-menu-link run")
                .text(k);
              if (k in files) {
                flink.on("click", function() {
                  runFile($(this), files[k].getContents());
                });
                fli.append(flink);
              }
              else {
                fli.addClass("pure-menu-disabled");
                fli.append($("<div>").css("white-space", "nowrap").text(k));
              }
              list.append(fli);
            });
            table.append($("<tr>")
              .append($("<td>").text(name))
              .append(
                $("<td>").append(div.append(ul.append(li.append(list)))))
              .append(
                $("<td>")));
          });
          /*
          $("#students-loading").hide();
          var table = $("#students");
          var tr = $("<tr>");
          tr.append($("<th>").text("Student"));
          $.each(names, function(_, name) {
            tr.append($("<th>").text(name));
          });
          table.append($("<thead>").append(tr));
          $.each(Object.keys(submissions).sort(), function(_, name) {
            var files = submissions[name];
            var tr = $("<tr>");
            tr.append($("<td>").addClass("student").text(name));
            $.each(names, function(_, k) {
              if (k in files) {
                var td = $("<td>").addClass("file-run");
                td.on("click", function() {
                  runFile($(this), files[k].getContents());
                });
                tr.append(td.text("Run"));
              }
              else {
                tr.append($("<td>").addClass("missing").text("Missing"));
              }
            });
            table.append(tr);
          });
          */
        }

        var submissionsID = "0B-_f7M_B5NMiQjFLeEo1SVBBUE0";
        var names = ["list-drill-code.arr", "list-drill-tests.arr"].sort();

        gatherSubmissions(submissionsID).then(function(submissions) {
          var submissions = filterSubmissions(submissions, names);
          renderSubmissions(submissions);
        }).fail(function(f) { console.log(f); });
      });
  });
});
