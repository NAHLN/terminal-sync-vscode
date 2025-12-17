(function () {
  const vscode = acquireVsCodeApi();

  let globInput;
  let applyBtn;
  let clearBtn;

  window.addEventListener("DOMContentLoaded", () => {
    globInput = document.getElementById("globInput");
    applyBtn = document.getElementById("globApply");
    clearBtn = document.getElementById("globClear");

    if (!globInput || !applyBtn || !clearBtn) return;

    // Apply button: explicitly apply glob
    applyBtn.addEventListener("click", () => {
      const pattern = globInput.value ?? "";
      vscode.postMessage({
        command: "globApply",
        pattern
      });
    });

    // Clear button: clear input AND clear highlighting
    clearBtn.addEventListener("click", () => {
      globInput.value = "";
      vscode.postMessage({
        command: "globClear"
      });
    });

    // Ctrl/Cmd-F focuses input (optional convenience)
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        globInput.focus();
        globInput.select();
      }
    });

    window.addEventListener("message", (event) => {
    if (event.data.command === "applyGlob") 
    {
        const matches = new Set(event.data.matches ?? []);

        document
        .querySelectorAll("tr[data-filename]")
        .forEach(row => {
            if (matches.has(row.dataset.filename)) {
            row.classList.add("glob-match");
            } else {
            row.classList.remove("glob-match");
            }
        });
    }
    });


  });

  // Expose handleClick for table rows
  window.handleClick = function (action, path) {
    vscode.postMessage({ command: action, path });
  };


})();
