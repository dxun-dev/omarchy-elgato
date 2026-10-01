  // Injected only into the offscreen editor copy by generate-previews --verify.
  property bool testPauseSaves: true
  property var testDispatched: []
  property var testExpected: []
  function checkEditor(condition, message) {
    if (!condition) throw new Error(message)
  }
  function runEditorChecks() {
    try {
      root.selectedControl = "key"; root.selectedIndex = 0
      root.saveDisplay("text")
      root.saveIcon("preset:terminal.svg")
      root.selectedIndex = 1
      root.saveColor("button", "#123456")
      checkEditor(root.saveQueue.length === 3, "Rapid saves were dropped")
      checkEditor(root.saveQueue[0].command[3] === "1" && root.saveQueue[2].command[3] === "2", "Save destination changed with selection")
      root.saveQueue = []

      root.selectedControl = "dial"; root.selectedIndex = 0
      dialTextField.text = "Captured caption"
      dialTextField.textEdited()
      root.selectedIndex = 1
      checkEditor(root.saveQueue.length === 1, "Switching dials did not commit pending text")
      checkEditor(root.saveQueue[0].command[3] === "1" && root.saveQueue[0].command[5] === "Captured caption", "Caption text or dial destination changed")
      root.saveQueue = []

      dialTextField.text = "Before page switch"; dialTextField.textEdited()
      var profile = JSON.parse(JSON.stringify(root.profile))
      profile.pages.plus.active = "page-2"; root.profile = profile
      checkEditor(root.saveQueue.length === 1 && root.saveQueue[0].command[7] === "page-1", "Caption moved to the new page")
      root.saveQueue = []

      root.selectedControl = "dial"; root.selectedIndex = 0
      dialTextField.text = "Before close"; dialTextField.textEdited()
      root.close()
      checkEditor(root.saveQueue.length === 1 && root.saveQueue[0].command[5] === "Before close", "Closing discarded the dial caption")
      root.saveQueue = []

      root.queueCaption("plus", "page-2", 0, "custom", "First")
      root.saveDialDisplay("text", "Second")
      root.saveIcon("automatic")
      root.testExpected = root.saveQueue.map(function(job) { return job.command })
      root.testPauseSaves = false; root.runSaveQueue()
      verifyDone.start()
    } catch (error) { console.error("EDITOR_CHECK_FAILED: " + error); Qt.quit() }
  }
  Timer {
    id: verifyDone
    interval: 500; repeat: true
    onTriggered: {
      if (root.saving) return
      if (JSON.stringify(root.testDispatched) === JSON.stringify(root.testExpected)) console.log("EDITOR_CHECK_PASSED")
      else console.error("EDITOR_CHECK_FAILED: queue order changed")
      Qt.quit()
    }
  }
