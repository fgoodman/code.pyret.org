define("web-runner", [
    "q",
    
    "js/runtime-anf",
    "trove/runtime-lib",
    
    "/js/guess-gas.js",
    
    "compiler/compile-lib.arr",
    "compiler/compile-structs.arr",
    
    "compiler/locators/builtin.arr",
    "/js/cpo-builtins.js",
    "/js/gdrive-locators.js",
  ],
  function(
    q,

    rtLib,
    runtimeLib,
    
    guessGas,
    
    compileLib,
    compileStructs,
    
    builtin,
    cpoBuiltin,
    gdriveLocators) {

  function createRunner(imgUrlProxy, findModule) {
    var runnerP = q.defer();
    var runtime = rtLib.makeRuntime({stdout: function(str) { console.log(str); }});
    runtime.setParam("imgUrlProxy", imgUrlProxy);

    return runnerP.promise;
  }

  return {createRunner: createRunner};
});
