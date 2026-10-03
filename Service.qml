import QtQuick
import Quickshell
import Quickshell.Io

// The shell owns one long-running HID reader. It exits cleanly with the shell.
Item {
  id: root
  readonly property string helper: Qt.resolvedUrl("bin/omarchy-elgato").toString().replace("file://", "")

  Process {
    id: daemon
    command: [root.helper, "daemon"]
    onExited: function(code) { if (code !== 78) restartTimer.start() }
  }

  IpcHandler {
    target: "dxun-dev.omarchy-elgato.runtime"
    function retry(): void {
      if (daemon.running) return
      restartTimer.stop()
      daemon.running = true
    }
  }

  Timer {
    id: restartTimer
    interval: 2000
    onTriggered: if (!daemon.running) daemon.running = true
  }

  Component.onCompleted: daemon.running = true
}
