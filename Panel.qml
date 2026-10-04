import QtQuick
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "dxun-dev.omarchy-elgato"
  ipcTarget: "dxun-dev.omarchy-elgato"
  manageIpc: false
  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  property var status: ({ running: false, plus: null, pedal: null, profile: "omarchy-elgato Default", brightness: 55 })
  property var profile: ({ keys: [], classicKeys: [], dials: [] })
  property string error: ""
  property string saveError: ""
  property bool detached: false
  readonly property bool windowVisible: detachedWindow.visible
  readonly property bool connected: (status.devices || []).some(function(d) { return d.connected }) || (status.lights || []).some(function(l) { return l.reachable })
  readonly property bool selectedDeviceConnected: selectedDevice === "lights" ? (status.lights || []).some(function(l) { return l.reachable }) : (status.devices || []).some(function(d) { return d.kind === root.selectedDevice && d.connected })
  readonly property bool hasPlus: status.plus !== null && status.plus !== undefined
  readonly property bool hasClassic: status.classic !== null && status.classic !== undefined
  readonly property bool isDeck: selectedDevice !== "lights"
  readonly property string runtimePhase: (status.runtime || {}).phase || ""
  readonly property bool runtimePreparing: runtimePhase === "preparing"
  readonly property bool runtimeFailed: runtimePhase === "failed"
  function retryRuntime() {
    if (retryProc.running || runtimePreparing) return
    retryProc.running = true
  }
  property var models: []
  readonly property var selectedModel: models.find(function(m) { return m.id === root.selectedDevice }) || { controls: [] }
  readonly property var baseMapping: selectedDevice === "classic" ? { keys: profile.classicKeys || [], dials: [] } : selectedDevice === "plus" ? { keys: profile.keys || [], dials: profile.dials || [] } : ((profile.devices || {})[selectedDevice] || { keys: [], dials: [] })
  readonly property var pageSet: (profile.pages || {})[selectedDevice] || { active: "page-1", items: [] }
  readonly property string activePage: pageSet.active
  readonly property var currentPage: pageSet.items.find(function(p) { return p.id === root.activePage }) || { name: "Page 1" }
  readonly property var pageOptions: pageSet.items.filter(function(p) { return !p.kind }).map(function(p) { return {value:p.id, label:p.name} })
  readonly property bool inFolder: currentPage.kind === "folder"
  readonly property bool backButtonSelected: inFolder && selectedControl === "key" && selectedIndex === 0
  readonly property string mainPage: (pageSet.history || [])[0] || activePage
  readonly property string folderTrail: (pageSet.history || []).concat([activePage]).map(function(id) { var p = root.pageSet.items.find(function(p) { return p.id === id }); return p ? p.name : "" }).join(" › ")
  property bool creatingFolder: false
  property string folderNameDraft: ""
  readonly property var selectedMapping: pageSet.items.length && activePage !== pageSet.items[0].id ? (currentPage.keys && currentPage.dials ? currentPage : baseMapping) : baseMapping
  readonly property var allActionOptions: actionOptions.filter(function(a) { return (a.controls || []).indexOf("dialPress") >= 0 }).concat(pageSet.items.map(function(p) { return {value:(p.kind === "folder" ? "folder:" : "page:") + p.id, label:p.kind === "folder" ? "Folder · " + p.name : "Page · Go to " + p.name, icon:""} }))
  property string pageEditMode: ""
  property string pageNameDraft: ""
  onActivePageChanged: { iconStateTarget = ""; buttonTextField.commitText(); dialTextField.commit(); buttonPreviews = []; dialPreviews = []; selectedIndex = 0; selectedControl = "key"; textDraft = ""; pageEditMode = ""; creatingFolder = false }
  readonly property var selectedKeys: selectedMapping.keys || []
  readonly property var selectedDials: selectedMapping.dials || []
  readonly property var buttonControls: selectedModel.controls.filter(function(c) { return c.type === "button" })
  readonly property var dialControls: selectedModel.controls.filter(function(c) { return c.type === "encoder" })
  readonly property var lcdControls: selectedModel.controls.filter(function(c) { return c.type === "lcd-segment" })
  readonly property int deckColumns: selectedDevice === "studio" ? 8 : Math.max(1, ...selectedModel.controls.map(function(c) { return c.column + (c.columnSpan || 1) }))
  readonly property int deckRows: selectedDevice === "studio" ? Math.ceil(buttonControls.length / deckColumns) : Math.max(1, ...buttonControls.map(function(c) { return c.row + 1 }))
  readonly property bool hasLights: (status.lights || []).length > 0
  readonly property string helper: Qt.resolvedUrl("bin/omarchy-elgato").toString().replace("file://", "")
  property var actionOptions: []
  property double lastCatalogRefresh: 0
  readonly property var dialTurnActionOptions: actionOptions.filter(function(a) { return (a.controls || []).indexOf("dialTurn") >= 0 })
  property var buttonPreviews: []
  property var dialPreviews: []
  readonly property var selectedDial: selectedDials[selectedIndex] || {}
  readonly property var selectedDialDisplay: selectedDial.display || {}
  property string iconStateTarget: ""
  readonly property string selectedStatusAction: selectedControl === "dial" ? selectedDial.press || "" : selectedKey.action || ""
  readonly property var selectedStateOptions: (actionOptions.find(function(a) { return a.value === root.selectedStatusAction }) || {}).states || []
  readonly property string selectedIconState: selectedStateOptions.some(function(s) { return s.value === root.iconStateTarget }) ? iconStateTarget : ""
  readonly property string selectedIconOverride: selectedIconState ? (selectedAppearance.stateAction === selectedStatusAction ? (selectedAppearance.stateIcons || {})[selectedIconState] || "" : "") : selectedAppearance.icon || ""
  readonly property string selectedLiveState: (status.actionStates || {})[selectedStatusAction] || "unknown"
  onSelectedStatusActionChanged: { iconStateTarget = ""; showIconGallery = false }
  readonly property var selectedAppearance: selectedControl === "dial" ? selectedDialDisplay : selectedKey
  readonly property string dialDisplayMode: selectedDialDisplay.displayMode || "default"
  property string textDraft: ""
  onSelectedDeviceChanged: { iconStateTarget = ""; buttonTextField.commitText(); dialTextField.commit(); buttonPreviews = []; dialPreviews = []; textDraft = ""; pageEditMode = ""; creatingFolder = false }
  onSelectedIndexChanged: resetInspectorSelection()
  onSelectedControlChanged: resetInspectorSelection()
  property var availableIcons: []
  property string iconsDirectory: ""
  property bool showIconGallery: false
  onShowIconGalleryChanged: { if (showIconGallery) iconPopup.open(); else iconPopup.close() }
  property string iconSearch: ""
  readonly property var selectedKey: selectedKeys[selectedIndex] || {}
  readonly property var selectedFolder: pageSet.items.find(function(p) { return p.kind === "folder" && "folder:" + p.id === root.selectedKey.action }) || null
  readonly property bool folderButtonSelected: isDeck && selectedControl === "key" && selectedFolder !== null
  readonly property bool pageButtonSelected: isDeck && selectedControl === "key" && /^(?:(page|page_global):|page_(?:global_)?(?:next|previous|first|last)$)/.test(selectedKey.action || "")
  readonly property bool pageButtonGlobal: /^page_global[:_]/.test(selectedKey.action || "")
  readonly property string pageButtonTarget: pageButtonSelected ? (selectedKey.action.indexOf(":") >= 0 ? selectedKey.action.slice(selectedKey.action.indexOf(":") + 1) : "mode:" + selectedKey.action.replace(/^page_(global_)?/, "")) : ""
  readonly property var buttonActionOptions: [{value:"choose_folder",label:"Folder",icon:""},{value:"choose_page",label:"Page",icon:""}].concat(actionOptions.filter(function(a) { return (a.controls || []).indexOf("button") >= 0 && !/^page_(?:global_)?(?:next|previous|first|last)$/.test(a.value) }), pageSet.items.filter(function(p) { return p.kind === "folder" }).map(function(p) { return {value:"folder:" + p.id,label:"Folder · " + p.name,icon:""} }))
  readonly property var pageTargetOptions: [{value:"mode:next",label:"Next"},{value:"mode:previous",label:"Previous"},{value:"mode:first",label:"First"},{value:"mode:last",label:"Last"}].concat(pageOptions)
  readonly property string selectedButtonAction: creatingFolder ? "choose_folder" : pageButtonSelected ? "choose_page" : selectedKey.action || ""
  readonly property string inspectorKind: !isDeck ? "Light inspector" : selectedControl === "dial" ? "Dial inspector" : backButtonSelected ? "Navigation inspector" : pageButtonSelected ? "Page inspector" : folderButtonSelected ? "Folder inspector" : "Action inspector"
  readonly property string inspectorTitle: !isDeck ? selectedLightName() : selectedControl === "dial" ? "Dial " + (selectedIndex + 1) : backButtonSelected ? "Back" : pageButtonSelected ? "Page button · Key " + (selectedIndex + 1) : folderButtonSelected ? selectedFolder.name : "Key " + (selectedIndex + 1)
  readonly property string buttonDisplayMode: selectedKey.displayMode || (selectedKey.displayText === "" || (selectedKey.icon && selectedKey.displayText === undefined) ? "icon" : "icon-text")
  readonly property bool supportsIcon: (buttonControls.find(function(c) { return c.index === root.selectedIndex }) || {}).feedbackType === "lcd"
  readonly property bool supportsColor: selectedControl === "dial" ? !!((dialControls.find(function(c) { return c.index === root.selectedIndex }) || {}).hasLed || (dialControls.find(function(c) { return c.index === root.selectedIndex }) || {}).ledRingSteps) : (buttonControls.find(function(c) { return c.index === root.selectedIndex }) || {}).feedbackType === "rgb" || supportsIcon
  readonly property bool colorDisplay: buttonDisplayMode === "color" || buttonDisplayMode === "color-text"
  readonly property bool showsText: buttonDisplayMode !== "icon" && buttonDisplayMode !== "color"

  readonly property var filteredIcons: availableIcons.filter(function(icon) { return (icon.group + " " + icon.label).toLowerCase().indexOf(root.iconSearch.toLowerCase()) >= 0 })
  property string selectedDevice: "plus"
  onDeviceOptionsChanged: {
    if (deviceOptions.length && !deviceOptions.some(function(d) { return d.value === root.selectedDevice })) {
      selectedDevice = deviceOptions[0].value
      selectedControl = isDeck ? "key" : selectedDevice
      selectedIndex = 0
    }
  }
  property string selectedControl: "key"
  property int selectedIndex: 0
  property int selectedLightIndex: -1
  readonly property color controlFace: "#080808"
  readonly property color controlFaceRaised: "#111111"
  readonly property color controlBorder: Qt.rgba(1, 1, 1, 0.22)
  readonly property var deviceOptions: models.map(function(m) {
    var live = (root.status.devices || []).some(function(d) { return d.kind === m.id })
    return { value: m.id, label: m.name + (live ? "" : " (offline)") }
  }).sort(function(a, b) {
    return Number(b.label.indexOf("(offline)") < 0) - Number(a.label.indexOf("(offline)") < 0)
  }).concat(hasLights ? [{ value: "lights", label: "Key Lights" }] : [])

  component IconButton: Controls.Button {
    id: iconButton
    implicitHeight: Style.space(32)
    opacity: enabled ? 1 : 0.45
    background: Rectangle { color: iconButton.hovered ? root.controlFaceRaised : root.controlFace; border.color: iconButton.activeFocus ? Color.accent : root.controlBorder }
    contentItem: Text { text: iconButton.text; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.body; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
  }
  component IconField: Controls.TextField {
    id: iconField
    implicitHeight: Style.space(32)
    color: Color.foreground
    placeholderTextColor: Color.muted
    selectionColor: Color.accent
    font.family: Style.font.family
    font.pixelSize: Style.font.body
    background: Rectangle { color: root.controlFace; border.color: iconField.activeFocus ? Color.accent : root.controlBorder }
  }
  function resetInspectorSelection() {
    iconStateTarget = ""
    buttonTextField.commitText()
    dialTextField.commit()
    creatingFolder = false; folderNameDraft = ""; showIconGallery = false; iconSearch = ""
    textDraft = selectedKey.displayText !== undefined ? selectedKey.displayText : selectedKey.label || actionName(selectedKey.action)
  }
  function openPreview(index) {
    if (root.saving) return
    var action = (selectedKeys[index] || {}).action || ""
    if (action.indexOf("folder:") === 0) pageCommand("select", action.slice(7))
    else if (action === "folder_back" && inFolder) folderBack()
  }
  function selectControl(type, index) { selectedControl = type; selectedIndex = index; keyCatcher.forceActiveFocus() }
  readonly property bool editingControls: pageEditMode !== "" || creatingFolder || buttonTextField.activeFocus || dialTextField.activeFocus || showIconGallery || deviceDropdown.popupOpen || displayModeDropdown.popupOpen || pageDropdown.popupOpen || actionDropdown.popupOpen || pageTargetDropdown.popupOpen
  function clearSelectedButton() {
    if (!isDeck || selectedControl !== "key" || backButtonSelected || editingControls || root.saving || !selectedKey.action || selectedKey.action === "none") return false
    saveAction("action", "none")
    return true
  }
  function actionName(value) {
    if ((value || "").indexOf("page_global:") === 0) value = "page:" + value.slice(12)
    for (var i = 0; i < allActionOptions.length; i++) if (allActionOptions[i].value === value) return allActionOptions[i].label.replace(/^(Function|Application|Key) · /, "")
    return value || "Unassigned"
  }
  function actionIcon(value) {
    for (var i = 0; i < allActionOptions.length; i++) if (allActionOptions[i].value === value) return allActionOptions[i].icon || ""
    return ""
  }
  function iconReference(value) { return value && value.indexOf("preset:") === 0 ? value.replace(/\.jpg$/i, ".svg") : value }
  function keyIcon(key) {
    if (key && key.icon) {
      var chosen = availableIcons.find(function(icon) { return icon.value === root.iconReference(key.icon) })
      if (chosen) return chosen.url
      if (key.icon.indexOf("/") === 0) return "file://" + encodeURIComponent(key.icon).replace(/%2F/g, "/")
    }
    return actionIcon((key || {}).action)
  }
  property var saveQueue: []
  readonly property bool saving: saveProc.running || saveQueue.length > 0
  function enqueueSave(command, pageEdit) {
    if (!saving) saveError = ""
    saveQueue = saveQueue.concat([{ command: command.slice(), pageEdit: !!pageEdit }])
    runSaveQueue()
  }
  function runSaveQueue() {
    if (saveProc.running || !saveQueue.length) return
    var next = saveQueue[0]; saveQueue = saveQueue.slice(1)
    saveProc.command = next.command; saveProc.pageEdit = next.pageEdit; saveProc.running = true
  }
  function commitPendingText() { buttonTextField.commitText(); dialTextField.commit() }
  function saveDisplay(mode) {
    commitPendingText()
    enqueueSave([helper, "set-device-display", selectedDevice, String(selectedIndex + 1), mode, "--page", activePage])
  }
  function queueCaption(model, page, index, mode, text) {
    var args = [helper, "set-device-text", model, String(index + 1), mode]
    if (mode === "custom") args.push(text)
    enqueueSave(args.concat(["--page", page]))
  }
  function resetCaption() {
    buttonTextField.dirty = false
    queueCaption(selectedDevice, activePage, selectedIndex, "automatic", "")
    textDraft = selectedKey.label || actionName(selectedKey.action)
  }
  function cancelEdit() {
    if (showIconGallery) { showIconGallery = false; return true }
    if (pageEditMode) { pageEditMode = ""; return true }
    if (creatingFolder) { creatingFolder = false; return true }
    return false
  }
  function colorHex(rgb) {
    return "#" + rgb.map(function(v) { return ("0" + v.toString(16)).slice(-2) }).join("")
  }
  function saveColor(target, hex) {
    enqueueSave([helper, "set-device-color", selectedDevice, String(selectedIndex + 1), target, hex, "--page", activePage])
  }
  component ColorPicker: Column {
    id: picker
    property string label: "Color"
    property var rgb: [40, 90, 130]
    signal chosen(string hex)
    spacing: Style.space(6)
    Text { text: picker.label; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.caption }
    Row {
      width: parent.width; spacing: Style.space(8)
      Rectangle { width: Style.space(32); height: width; color: root.colorHex(picker.rgb); border.color: root.controlBorder }
      IconField {
        width: parent.width - Style.space(40); text: root.colorHex(picker.rgb); maximumLength: 7
        placeholderText: "#RRGGBB"
        validator: RegularExpressionValidator { regularExpression: /#[0-9a-fA-F]{6}/ }
        onAccepted: { if (acceptableInput) picker.chosen(text) }
        onEditingFinished: { if (acceptableInput && text.toLowerCase() !== root.colorHex(picker.rgb)) picker.chosen(text) }
      }
    }
    Repeater {
      id: channels
      model: ["Red", "Green", "Blue"]
      Row {
        required property int index
        required property string modelData
        width: picker.width; spacing: Style.space(8)
        Text { width: Style.space(42); text: modelData; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption; anchors.verticalCenter: parent.verticalCenter }
        Controls.Slider {
          id: channel
          width: parent.width - Style.space(50); from: 0; to: 255; stepSize: 1; value: picker.rgb[parent.index]
          onPressedChanged: if (!pressed) {
            var values = picker.rgb.slice(); values[parent.index] = Math.round(value); picker.chosen(root.colorHex(values))
          }
          Keys.onReleased: function(event) { var values = picker.rgb.slice(); values[parent.index] = Math.round(value); picker.chosen(root.colorHex(values)) }
        }
      }
    }
    Row {
      spacing: Style.space(6)
      Repeater {
        model: ["#000000", "#ffffff", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"]
        Rectangle {
          required property string modelData
          width: Style.space(22); height: width; color: modelData; border.color: root.controlBorder
          MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: picker.chosen(parent.modelData) }
        }
      }
    }
  }
  function saveDialDisplay(field, value) {
    commitPendingText()
    enqueueSave([helper, "set-dial-display", selectedDevice, String(selectedIndex + 1), field, value, "--page", activePage])
  }
  function saveIcon(value) {
    if (selectedIconState) {
      enqueueSave([helper, "set-state-icon", selectedDevice, String(selectedIndex + 1), selectedControl === "dial" ? "dial" : "button", selectedIconState, value, "--page", activePage]); return
    }
    if (selectedControl === "dial") { saveDialDisplay("icon", value); return }
    enqueueSave([helper, "set-device-icon", selectedDevice, String(selectedIndex + 1), value, "--page", activePage])
  }
  function setPageButton(id, global) { if (id) saveAction("action", id.indexOf("mode:") === 0 ? (global ? "page_global_" : "page_") + id.slice(5) : (global ? "page_global:" : "page:") + id) }
  function chooseButtonAction(action) {
    if (action === "choose_page") { creatingFolder = false; if (!pageButtonSelected && pageOptions.length) setPageButton(pageOptions[0].value, false) }
    else if (action === "choose_folder") { creatingFolder = true; folderNameDraft = "New folder" }
    else { creatingFolder = false; saveAction("action", action) }
  }
  function saveAction(slot, action) {
    commitPendingText()
    var args
    if (isDeck && selectedControl === "key") args = [helper, "set-device-key", selectedDevice, String(selectedIndex + 1), action]
    else if (isDeck && selectedControl === "dial") args = [helper, "set-device-dial", selectedDevice, String(selectedIndex + 1), slot, action]
    else return
    enqueueSave(args.concat(["--page", activePage]))
  }

  function createFolder() {
    if (backButtonSelected) return
    commitPendingText()
    enqueueSave([helper, "folder-create", selectedDevice, activePage, String(selectedIndex + 1), folderNameDraft], true)
  }
  function folderBack() {
    commitPendingText()
    enqueueSave([helper, "folder-back", selectedDevice], true)
  }
  function editPage(mode) {
    pageEditMode = mode
    Qt.callLater(function() { if (mode !== "delete") pageNameField.forceActiveFocus(); else pageActionRow.forceActiveFocus() })
    pageNameDraft = mode === "add" ? "Page " + (pageSet.items.length + 1) : mode === "duplicate" ? currentPage.name + " Copy" : currentPage.name
  }
  function pageCommand(mode, id, name) {
    commitPendingText()
    var args = [helper, "page", selectedDevice, mode]
    if (id !== undefined) args = args.concat([id])
    if (name !== undefined) args = args.concat([name])
    enqueueSave(args, true)
  }
  function applyPageEdit() {
    pageCommand(pageEditMode, pageEditMode === "add" ? undefined : activePage, pageEditMode === "delete" ? undefined : pageNameDraft)
  }
  function selectedLights() {
    var lights = root.status.lights || []
    return root.selectedLightIndex < 0 ? lights.filter(function(light) { return light.reachable }) : (lights[root.selectedLightIndex] ? [lights[root.selectedLightIndex]] : [])
  }
  function selectedLightName() {
    if (root.selectedLightIndex < 0) return "All Key Lights"
    return ((root.status.lights || [])[root.selectedLightIndex] || {}).name || "Key Light"
  }
  function selectedLightValue(field, fallback) {
    var lights = selectedLights().filter(function(light) { return light.reachable && light[field] !== undefined })
    if (lights.length === 0) return fallback
    var total = 0
    for (var i = 0; i < lights.length; i++) total += Number(lights[i][field])
    return Math.round(total / lights.length)
  }
  function selectedLightReachable() { return selectedLights().some(function(light) { return light.reachable }) }
  function selectedLightOn() { return selectedLights().some(function(light) { return light.reachable && light.on }) }
  function lightAction(action, value) {
    if (lightProc.running) return
    lightProc.command = [root.helper, "lights", action, "--target", root.selectedLightIndex < 0 ? "all" : String(root.selectedLightIndex)]
    if (value !== undefined) lightProc.command = lightProc.command.concat(["--value", String(Math.round(value))])
    lightProc.running = true
  }

  function open() {
    if (!catalogProc.running) catalogProc.running = true
    if (detached) detachedWindow.visible = true
    else root.controller.show()
    refresh()
  }
  function close() {
    buttonTextField.commitText()
    dialTextField.commit()
    showIconGallery = false
    if (detached) detachedWindow.visible = false
    else root.controller.hide()
  }
  function toggle() {
    if (detached) open()
    else if (root.opened) close()
    else open()
  }
  function detach() {
    root.controller.hide()
    detached = true
    detachedWindow.visible = true
    refresh()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }
  function dock() {
    detachedWindow.visible = false
    detached = false
    root.controller.show()
    refresh()
  }
  function refresh() {
    if (!models.length && !modelsProc.running) modelsProc.running = true
    if (isDeck && !previewProc.running) {
      previewProc.model = selectedDevice
      previewProc.pageId = activePage
      previewProc.command = [helper, "button-previews", selectedDevice, "--page", activePage]
      previewProc.running = true
    }
    if (isDeck && !dialPreviewProc.running) {
      dialPreviewProc.model = selectedDevice; dialPreviewProc.pageId = activePage
      dialPreviewProc.command = [helper, "dial-previews", selectedDevice, "--page", activePage]; dialPreviewProc.running = true
    }
    if (!iconsProc.running) iconsProc.running = true
    if (!statusProc.running) statusProc.running = true
    if (!profileProc.running) profileProc.running = true
    if ((root.actionOptions.length === 0 || Date.now() - lastCatalogRefresh > 10000) && !catalogProc.running) catalogProc.running = true
  }
  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function") return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  Process {
    id: retryProc
    command: ["omarchy-shell", "dxun-dev.omarchy-elgato.runtime", "retry"]
    stderr: StdioCollector { onStreamFinished: { if (text.trim()) root.error = text.trim() } }
    onExited: function(code) { if (code === 0 && !statusProc.running) statusProc.running = true }
  }
  Process {
    id: modelsProc
    command: [root.helper, "models"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: { try { root.models = JSON.parse(text) } catch (e) { root.error = "Could not load model layouts" } }
    }
  }
  Process {
    id: statusProc
    command: [root.helper, "status", "--json"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try { root.status = JSON.parse(text); root.error = "" }
        catch (e) { root.error = "Could not read Stream Deck status" }
      }
    }
  }
  Process {
    id: catalogProc
    command: [root.helper, "catalog"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: { try { root.actionOptions = JSON.parse(text); root.lastCatalogRefresh = Date.now() } catch (e) { root.error = "Could not load action catalog" } }
    }
  }
  Process {
    id: iconsProc
    command: [root.helper, "icons"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try { var catalog = JSON.parse(text); root.iconsDirectory = catalog.directory; root.availableIcons = catalog.icons }
        catch (e) { root.error = "Could not read available icons" }
      }
    }
  }
  Process {
    id: dialPreviewProc
    property string model: ""
    property string pageId: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: { try { if (dialPreviewProc.model === root.selectedDevice && dialPreviewProc.pageId === root.activePage) root.dialPreviews = JSON.parse(text) } catch (e) {} }
    }
  }
  Process {
    id: previewProc
    property string model: ""
    property string pageId: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: { try { if (previewProc.model === root.selectedDevice && previewProc.pageId === root.activePage) root.buttonPreviews = JSON.parse(text) } catch (e) {} }
    }
  }
  Process {
    id: profileProc
    command: [root.helper, "profile"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: { try { root.profile = JSON.parse(text); if (!buttonTextField.activeFocus) root.textDraft = root.selectedKey.displayText !== undefined ? root.selectedKey.displayText : root.selectedKey.label || root.actionName(root.selectedKey.action) } catch (e) {} }
    }
  }
  Process {
    id: saveProc
    property bool pageEdit: false
    stderr: StdioCollector { onStreamFinished: { if (text.trim()) root.saveError = text.trim() } }
    onExited: function(code) {
      if (code === 0 && pageEdit) root.pageEditMode = ""
      if (code === 0 && !root.saveQueue.length) root.refresh()
      Qt.callLater(root.runSaveQueue)
    }
  }
  Process {
    id: lightProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try {
          var next = Object.assign({}, root.status)
          next.lights = JSON.parse(text)
          root.status = next
          root.error = ""
        } catch (e) { root.refresh() }
      }
    }
    onExited: function(code) { if (code !== 0) root.error = "Key Light control failed"; root.refresh() }
  }
  Timer { interval: 5000; repeat: true; running: !root.opened && !detachedWindow.visible; triggeredOnStart: true; onTriggered: { if (!statusProc.running) statusProc.running = true } }
  Timer { interval: 1500; repeat: true; running: root.opened || detachedWindow.visible; triggeredOnStart: true; onTriggered: root.refresh() }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened && !root.detached
    centerOnBar: false
    gap: 0
    borderSpec: Border.flat("transparent", 0)
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(700))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    Item { id: popupHost; anchors.fill: parent }

    PanelKeyCatcher {
      id: keyCatcher
      parent: root.detached ? detachedHost : popupHost
      anchors.fill: parent
      onCloseRequested: { if (!root.cancelEdit()) root.close() }
      onTabRequested: function(direction) { if (!root.detached) root.switchPanel(direction) }
      blocked: root.detached || root.editingControls
      Keys.onDeletePressed: function(event) { event.accepted = root.clearSelectedButton() }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(10)

        Row {
          id: header
          width: parent.width
          height: Math.max(headerTitle.implicitHeight, detachButton.height)
          spacing: Style.space(10)
          Image { anchors.verticalCenter: parent.verticalCenter; width: Style.space(28); height: width; source: Qt.resolvedUrl("assets/elgato.svg"); fillMode: Image.PreserveAspectFit }
          Column {
            id: headerTitle
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - Style.space(28) - detachButton.width - connectionLabel.implicitWidth - parent.spacing * 3
            Text { text: "Omarchy Elgato"; color: Color.foreground; font.family: Style.font.family; font.pixelSize: 16; font.bold: true }
            Text { text: root.status.profile || "omarchy-elgato Default"; textFormat: Text.PlainText; color: Color.muted; font.family: Style.font.family; font.pixelSize: 11 }
          }
          PanelActionButton {
            id: detachButton
            anchors.verticalCenter: parent.verticalCenter
            size: Style.space(32)
            fontSize: Style.space(16)
            iconText: root.detached ? "\uf066" : "\uf08e"
            tooltipText: root.detached ? "Dock to bar" : "Detach window"
            focusable: true
            onClicked: root.detached ? root.dock() : root.detach()
          }
          Text { id: connectionLabel; anchors.verticalCenter: parent.verticalCenter; text: root.runtimePreparing ? "Preparing runtime" : root.runtimeFailed ? "Setup failed" : root.selectedDeviceConnected ? "Connected" : "Offline preview"; color: root.selectedDeviceConnected ? Color.accent : Color.muted; font.family: Style.font.family; font.pixelSize: 11 }
        }

        Column {
          visible: root.runtimePreparing || root.runtimeFailed
          width: parent.width; spacing: Style.space(8)
          Text {
            width: parent.width; wrapMode: Text.WordWrap; textFormat: Text.PlainText
            text: root.runtimePreparing ? ((root.status.runtime || {}).message || "Preparing runtime… First setup may take a moment.") : "Runtime preparation failed. Check your internet connection and the details below, then retry."
            color: root.runtimeFailed ? Color.urgent : Color.foreground
            font.family: Style.font.family; font.pixelSize: Style.font.body
          }
          Text {
            visible: root.runtimeFailed; width: parent.width; wrapMode: Text.WrapAnywhere; textFormat: Text.PlainText
            text: (root.status.runtime || {}).error || ""
            color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption
          }
          IconButton {
            visible: root.runtimeFailed; text: "Retry setup"; enabled: !retryProc.running
            onClicked: root.retryRuntime()
          }
        }

        Rectangle { width: parent.width; height: 1; color: Qt.rgba(1, 1, 1, 0.2) }

        Row {
          id: editorBody
          width: parent.width
          spacing: Style.space(14)
          height: Math.max(leftColumn.implicitHeight, inspectorContent.implicitHeight + Style.space(24), root.detached ? detachedWindow.height - Style.space(130) : 0)

          Column {
            id: leftColumn
            width: parent.width * 0.61
            spacing: Style.space(10)
            ToggleDropdown {
              id: deviceDropdown
              width: parent.width
              showLabel: false
              options: root.deviceOptions
              value: root.selectedDevice
              onChanged: function(selected) { root.selectedDevice = selected; root.selectedIndex = 0; root.selectedLightIndex = -1; root.selectedControl = selected !== "lights" ? "key" : selected; deviceDropdown.value = Qt.binding(function() { return root.selectedDevice }) }
            }

            Column {
              visible: root.isDeck; width: parent.width; spacing: Style.space(6)
              ToggleDropdown {
                id: pageDropdown
                width: parent.width; showLabel: false; options: root.pageOptions; value: root.mainPage
                onChanged: function(selected) { root.pageCommand("select", selected); pageDropdown.value = Qt.binding(function() { return root.mainPage }) }
              }
              Text { visible: root.inFolder; width: parent.width; text: root.folderTrail; textFormat: Text.PlainText; wrapMode: Text.WordWrap; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.body }
              Item {
                id: pageActionRow
                width: parent.width; height: Style.space(32)
                Keys.onEscapePressed: function(event) { root.pageEditMode = ""; event.accepted = true }
                Keys.onReturnPressed: function(event) { if (root.pageEditMode === "delete") { root.applyPageEdit(); event.accepted = true } }
                Row {
                  anchors.fill: parent; spacing: Style.space(5)
                  visible: root.pageEditMode === "" || root.pageEditMode === "delete"
                  Repeater {
                    id: pageControls
                    model: root.pageEditMode === "delete" ? [{mode:"confirm-delete",label:"Confirm delete"},{mode:"cancel",label:"Cancel"}] : [{mode:"add",label:"Add"},{mode:"duplicate",label:"Duplicate"},{mode:"rename",label:"Rename"},{mode:"delete",label:"Delete"}]
                    IconButton { required property var modelData; width: (parent.width - parent.spacing * (pageControls.count - 1)) / pageControls.count; text: modelData.label; enabled: !root.saving && (modelData.mode !== "delete" || root.inFolder || root.pageOptions.length > 1); Controls.ToolTip.visible: hovered && modelData.mode === "confirm-delete"; Controls.ToolTip.text: "Delete “" + root.currentPage.name + "” and its assignments"; onClicked: { if (modelData.mode === "confirm-delete") root.applyPageEdit(); else if (modelData.mode === "cancel") root.pageEditMode = ""; else root.editPage(modelData.mode) } }
                  }
                }
                Row {
                  anchors.fill: parent; spacing: Style.space(5)
                  visible: root.pageEditMode !== "" && root.pageEditMode !== "delete"
                  IconField { id: pageNameField; width: parent.width - Style.space(135); text: root.pageNameDraft; maximumLength: 60; placeholderText: root.inFolder ? "Folder name" : "Page name"; onTextEdited: root.pageNameDraft = text; onAccepted: root.applyPageEdit(); Keys.onEscapePressed: function(event) { root.pageEditMode = ""; event.accepted = true } }
                  IconButton { width: Style.space(60); text: "Save"; enabled: root.pageNameDraft.trim() !== "" && !root.saving; onClicked: root.applyPageEdit() }
                  IconButton { width: Style.space(65); text: "Cancel"; onClicked: root.pageEditMode = "" }
                }
              }
            }

          Rectangle {
            width: parent.width; height: Math.max(Style.space(310), root.isDeck ? deckPreview.implicitHeight + Style.space(32) : 0); radius: 0
            color: Qt.rgba(0, 0, 0, 0.28); border.color: Qt.rgba(1, 1, 1, 0.14)

            Column {
              id: deckPreview
              visible: root.isDeck; anchors.centerIn: parent; width: parent.width - Style.space(28); spacing: Style.space(10)
              Item {
                  id: buttonCanvas
                  width: parent.width
                  readonly property real cellGap: Style.space(root.deckColumns >= 8 ? 5 : 8)
                  readonly property real cellSize: Math.max(1, (width - cellGap * (root.deckColumns - 1)) / root.deckColumns)
                  height: root.deckRows * cellSize + Math.max(0, root.deckRows - 1) * cellGap
                  Repeater {
                    model: root.buttonControls
                  Rectangle {
                    property int controlIndex: modelData.index
                    x: (root.selectedDevice === "studio" ? controlIndex % root.deckColumns : modelData.column) * (buttonCanvas.cellSize + buttonCanvas.cellGap)
                    y: (root.selectedDevice === "studio" ? Math.floor(controlIndex / root.deckColumns) : modelData.row) * (buttonCanvas.cellSize + buttonCanvas.cellGap)
                    width: buttonCanvas.cellSize; height: width; radius: modelData.feedbackType === "rgb" ? width / 2 : 0
                    color: modelData.feedbackType === "rgb" ? root.colorHex((root.selectedKeys[controlIndex] || {}).color || [40,90,130]) : root.selectedControl === "key" && root.selectedIndex === controlIndex ? root.controlFaceRaised : root.controlFace
                    border.width: root.selectedControl === "key" && root.selectedIndex === controlIndex ? 2 : 1
                    border.color: root.selectedControl === "key" && root.selectedIndex === controlIndex ? Color.accent : root.controlBorder
                    Column { anchors.centerIn: parent; width: parent.width - Style.space(6); spacing: Style.space(2)
                      Text { anchors.horizontalCenter: parent.horizontalCenter; text: controlIndex + 1; color: Color.muted; font.family: Style.font.family; font.pixelSize: 9 }
                      Image { anchors.horizontalCenter: parent.horizontalCenter; width: modelData.feedbackType === "lcd" ? Math.max(1, buttonCanvas.cellSize - Style.space(18)) : Math.min(Style.space(30), buttonCanvas.cellSize * 0.4); height: width; source: modelData.feedbackType === "lcd" ? (root.buttonPreviews[controlIndex] || root.keyIcon(root.selectedKeys[controlIndex])) : root.keyIcon(root.selectedKeys[controlIndex]); visible: source.toString() !== ""; fillMode: Image.PreserveAspectFit; smooth: true }
                      Text { visible: modelData.feedbackType !== "lcd" && buttonCanvas.cellSize >= Style.space(58); width: parent.width; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight; text: root.actionName((root.selectedKeys[controlIndex] || {}).action); textFormat: Text.PlainText; color: Color.foreground; font.family: Style.font.family; font.pixelSize: 9 }
                    }
                    Controls.ToolTip.visible: keyMouse.containsMouse
                    Controls.ToolTip.delay: 500
                    Controls.ToolTip.text: "Key " + (controlIndex + 1) + " · " + root.actionName((root.selectedKeys[controlIndex] || {}).action) + (((root.selectedKeys[controlIndex] || {}).action || "").indexOf("folder:") === 0 ? " · Double-click to open" : (root.selectedKeys[controlIndex] || {}).action === "folder_back" ? " · Double-click to go back" : "")
                    MouseArea { id: keyMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.selectControl("key", controlIndex); onDoubleClicked: root.openPreview(controlIndex) }
                  }
                  }
                  Rectangle {
                    visible: root.selectedDevice === "neo"
                    x: buttonCanvas.cellSize + buttonCanvas.cellGap; y: 2 * (buttonCanvas.cellSize + buttonCanvas.cellGap)
                    width: buttonCanvas.cellSize * 2 + buttonCanvas.cellGap; height: buttonCanvas.cellSize
                    color: root.controlFace; border.color: root.controlBorder
                    Text { anchors.centerIn: parent; width: parent.width - Style.space(8); horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight; text: root.profile.name || "omarchy-elgato"; textFormat: Text.PlainText; color: Color.foreground; font.pixelSize: 10 }
                  }
              }
              Column {
                visible: root.selectedDials.length > 0; width: parent.width; spacing: Style.space(12)
                Rectangle {
                  visible: root.lcdControls.length > 0; width: parent.width; height: visible ? Style.space(60) : 0; radius: 0; color: Qt.rgba(0, 0, 0, .5); border.color: Qt.rgba(1, 1, 1, .15)
                  Row { anchors.fill: parent
                    Repeater { model: root.selectedDials
                      Item {
                        width: parent.width / root.selectedDials.length; height: parent.height
                        Rectangle { visible: index > 0; width: 1; height: parent.height - Style.space(16); anchors.verticalCenter: parent.verticalCenter; color: root.controlBorder }
                        Image { anchors.fill: parent; source: root.dialPreviews[index] || ""; visible: source.toString() !== ""; fillMode: Image.Stretch }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.selectControl("dial", index) }
                        Text {
                          visible: !(root.dialPreviews[index] || "")
                          anchors.centerIn: parent; width: parent.width - Style.space(12)
                          horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
                          text: modelData.label; textFormat: Text.PlainText
                          color: Color.foreground; font.family: Style.font.family; font.pixelSize: 10
                        }
                      }
                    }
                  }
                }
                Row {
                  width: parent.width; spacing: 0
                  Repeater { model: root.selectedDials
                    Item {
                      width: parent.width / root.selectedDials.length; height: Style.space(56)
                      Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter; anchors.top: parent.top
                        width: Style.space(50); height: width; radius: width / 2
                        color: root.selectedControl === "dial" && root.selectedIndex === index ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, .25) : Qt.rgba(1, 1, 1, .06)
                        border.color: root.selectedControl === "dial" && root.selectedIndex === index ? Color.accent : Qt.rgba(1, 1, 1, .22)
                        Text { anchors.centerIn: parent; text: index + 1; color: Color.foreground; font.family: Style.font.family; font.pixelSize: 10 }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.selectControl("dial", index) }
                      }
                    }
                  }
                }
              }
            }





            Column {
              visible: root.selectedDevice === "lights"; anchors.centerIn: parent; width: parent.width - Style.space(28); spacing: Style.space(12)
              Text { text: "SELECT LIGHT"; color: Color.muted; font.family: Style.font.family; font.pixelSize: 9; font.bold: true }
              Row {
                width: parent.width; spacing: Style.space(8)
                Rectangle {
                  width: (parent.width - Style.space(16)) / 3; height: Style.space(140); radius: 0; color: root.controlFace
                  border.width: root.selectedLightIndex === -1 ? 2 : 1; border.color: root.selectedLightIndex === -1 ? Color.accent : root.controlBorder
                  Column { anchors.centerIn: parent; spacing: Style.space(7)
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: "󰛨"; color: root.selectedLightOn() ? "#f0b632" : Color.muted; font.family: Style.font.family; font.pixelSize: 30 }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: "ALL LIGHTS"; color: Color.foreground; font.family: Style.font.family; font.pixelSize: 10; font.bold: true }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: root.selectedLightReachable() ? root.selectedLightValue("brightness", 0) + "%" : "Unavailable"; color: Color.muted; font.family: Style.font.family; font.pixelSize: 9 }
                  }
                  MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.selectedLightIndex = -1 }
                }
                Repeater { model: root.status.lights || []
                  Rectangle {
                    required property var modelData; required property int index
                    width: (parent.width - Style.space(16)) / 3; height: Style.space(140); radius: 0; color: root.controlFace
                    border.width: root.selectedLightIndex === index ? 2 : 1; border.color: root.selectedLightIndex === index ? Color.accent : root.controlBorder
                    Column { anchors.centerIn: parent; width: parent.width - Style.space(8); spacing: Style.space(7)
                      Text { anchors.horizontalCenter: parent.horizontalCenter; text: "󰛨"; color: modelData.on ? "#f0b632" : Color.muted; font.family: Style.font.family; font.pixelSize: 30 }
                      Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight; text: modelData.name; textFormat: Text.PlainText; color: Color.foreground; font.family: Style.font.family; font.pixelSize: 10; font.bold: true }
                      Text { anchors.horizontalCenter: parent.horizontalCenter; text: modelData.reachable ? modelData.brightness + "% · " + Math.round(1000000 / modelData.temperature) + "K" : "Unavailable"; color: modelData.reachable ? Color.muted : Color.urgent; font.family: Style.font.family; font.pixelSize: 9 }
                    }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.selectedLightIndex = index }
                  }
                }
              }
            }
          }

          }

          Rectangle {
            width: editorBody.width - leftColumn.width - editorBody.spacing
            height: editorBody.height
            color: Qt.rgba(0, 0, 0, 0.28)
            border.color: Qt.rgba(1, 1, 1, 0.14)

          Column {
            id: inspectorContent
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: Style.space(12)
            spacing: Style.space(10)
            Text { text: root.inspectorKind; color: Qt.darker(Color.foreground, 1.4); font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
            Text {
              width: parent.width; wrapMode: Text.WordWrap; text: root.inspectorTitle; textFormat: Text.PlainText
              color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.heading; font.bold: true
            }
            SearchableDropdown {
              id: actionDropdown
              visible: root.isDeck && root.selectedControl === "key"
              enabled: !root.backButtonSelected && !root.saving
              width: parent.width; label: "On press"; options: root.buttonActionOptions
              value: root.selectedButtonAction
              onChanged: function(action) { root.chooseButtonAction(action); actionDropdown.value = Qt.binding(function() { return root.selectedButtonAction }) }
            }
            Column {
              visible: root.pageButtonSelected && !root.creatingFolder; width: parent.width; spacing: Style.space(8)
              ToggleDropdown { id: pageTargetDropdown; width: parent.width; label: "Target page"; options: root.pageTargetOptions; value: root.pageButtonTarget; enabled: !root.saving; onChanged: function(id) { root.setPageButton(id, root.pageButtonGlobal); pageTargetDropdown.value = Qt.binding(function() { return root.pageButtonTarget }) } }
              Controls.CheckBox {
                id: globalCheckbox; text: "Global"; checked: root.pageButtonGlobal; enabled: !root.saving
                font.family: Style.font.family; font.pixelSize: Style.font.body
                indicator: Rectangle { implicitWidth: Style.space(18); implicitHeight: Style.space(18); x: globalCheckbox.leftPadding; y: (globalCheckbox.height - height) / 2; color: root.controlFace; border.color: globalCheckbox.checked ? Color.accent : root.controlBorder; Text { anchors.centerIn: parent; visible: globalCheckbox.checked; text: "✓"; color: Color.accent; font.family: Style.font.family; font.pixelSize: Style.font.body } }
                contentItem: Text { text: globalCheckbox.text; color: Color.foreground; font: globalCheckbox.font; verticalAlignment: Text.AlignVCenter; leftPadding: globalCheckbox.indicator.width + Style.space(8) }
                onClicked: { root.setPageButton(root.pageButtonTarget, checked); checked = Qt.binding(function() { return root.pageButtonGlobal }) }
              }
            }
            Column {
              visible: root.isDeck && root.selectedControl === "key" && !root.backButtonSelected && root.creatingFolder
              width: parent.width; spacing: Style.space(6)
              IconField { visible: root.creatingFolder; width: parent.width; text: root.folderNameDraft; placeholderText: "Folder name"; maximumLength: 60; onTextEdited: root.folderNameDraft = text; onAccepted: root.createFolder(); Keys.onEscapePressed: function(event) { root.creatingFolder = false; event.accepted = true } }
              IconButton { visible: root.creatingFolder; width: parent.width; text: "Create and open"; enabled: root.folderNameDraft.trim() !== "" && !root.saving; onClicked: root.createFolder() }
            }
            Column {
              visible: root.isDeck && root.selectedControl === "key" && root.supportsIcon
              width: parent.width; spacing: Style.space(8)
              ToggleDropdown {
                id: displayModeDropdown
                width: parent.width; label: "Button display"
                options: [{value:"text",label:"Text only"},{value:"icon-text",label:"Icon and text"},{value:"icon",label:"Icon only"},{value:"color",label:"Color only"},{value:"color-text",label:"Color and text"}]
                value: root.buttonDisplayMode
                onChanged: function(mode) { root.saveDisplay(mode); displayModeDropdown.value = Qt.binding(function() { return root.buttonDisplayMode }) }
              }
              Text { visible: root.showsText; text: "Button text"; color: Qt.darker(Color.foreground, 1.4); font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
              Row {
                visible: root.showsText; width: parent.width; spacing: Style.space(6)
                IconField {
                  id: buttonTextField
                  width: parent.width - captionReset.width - parent.spacing; maximumLength: 80; placeholderText: "Button text…"
                  text: root.textDraft
                  property bool dirty: false
                  property string ownerModel: ""
                  property string ownerPage: ""
                  property int ownerIndex: 0
                  property string pendingText: ""
                  function commitText() {
                    if (!dirty) return
                    dirty = false; root.queueCaption(ownerModel, ownerPage, ownerIndex, "custom", pendingText)
                  }
                  onTextEdited: {
                    if (!dirty) { ownerModel = root.selectedDevice; ownerPage = root.activePage; ownerIndex = root.selectedIndex }
                    dirty = true; pendingText = text; root.textDraft = text
                  }
                  function cancelText() {
                    dirty = false; root.textDraft = root.selectedKey.displayText !== undefined ? root.selectedKey.displayText : root.selectedKey.label || root.actionName(root.selectedKey.action); focus = false
                  }
                  onAccepted: commitText()
                  onEditingFinished: commitText()
                  Keys.onEscapePressed: function(event) { cancelText(); event.accepted = true }
                }
                IconButton { id: captionReset; width: Style.space(32); text: "↺"; enabled: root.selectedKey.displayText !== undefined || buttonTextField.dirty; Controls.ToolTip.visible: hovered; Controls.ToolTip.text: "Use action name"; onClicked: root.resetCaption() }
              }
            }
            ColorPicker {
              visible: root.isDeck && root.supportsColor && (root.selectedControl === "dial" || !root.supportsIcon || root.colorDisplay)
              width: parent.width; enabled: !root.saving
              label: root.selectedControl === "dial" ? "Dial LED color" : root.supportsIcon ? "Background color" : "Button color"
              rgb: root.selectedControl === "dial" ? (root.selectedDials[root.selectedIndex] || {}).color || [40,90,130] : root.selectedKey.color || [40,90,130]
              onChosen: function(hex) { root.saveColor(root.selectedControl === "dial" ? "dial" : "button", hex) }
            }
            ColorPicker {
              visible: root.isDeck && root.selectedControl === "key" && root.supportsIcon && root.buttonDisplayMode === "color-text"
              width: parent.width; enabled: !root.saving; label: "Text color"
              rgb: root.selectedKey.textColor || [255,255,255]
              onChosen: function(hex) { root.saveColor("text", hex) }
            }
            Column {
              visible: root.isDeck && root.selectedControl === "dial" && root.lcdControls.length > 0
              width: parent.width; spacing: Style.space(8)
              ToggleDropdown {
                width: parent.width; label: "LCD display above dial"
                options: [{value:"default",label:"Default status"},{value:"text",label:"Text only"},{value:"icon-text",label:"Icon and text"},{value:"icon",label:"Icon only"},{value:"color",label:"Color only"},{value:"color-text",label:"Color and text"}]
                value: root.dialDisplayMode; enabled: !root.saving
                onChanged: function(mode) { root.saveDialDisplay("mode", mode) }
              }
              IconField {
                id: dialTextField
                visible: ["text","icon-text","color-text"].indexOf(root.dialDisplayMode) >= 0
                width: parent.width; maximumLength: 80; placeholderText: "Dial display text"
                text: root.selectedDialDisplay.displayText !== undefined ? root.selectedDialDisplay.displayText : root.selectedDial.label || ""
                property bool dirty: false
                property var owner: []
                property string pendingText: ""
                onTextEdited: { if (!dirty) owner = [root.selectedDevice, root.activePage, root.selectedIndex]; pendingText = text; dirty = true }
                function commit() {
                  if (!dirty) return
                  dirty = false
                  root.enqueueSave([root.helper, "set-dial-display", owner[0], String(owner[2] + 1), "text", pendingText, "--page", owner[1]])
                }
                onAccepted: commit()
                onEditingFinished: commit()
                Keys.onEscapePressed: function(event) { dirty = false; text = root.selectedDialDisplay.displayText !== undefined ? root.selectedDialDisplay.displayText : root.selectedDial.label || ""; focus = false; event.accepted = true }
              }
              ColorPicker {
                visible: root.dialDisplayMode !== "default"
                width: parent.width; enabled: !root.saving; label: "LCD background color"
                rgb: root.selectedDialDisplay.color || [40,90,130]
                onChosen: function(hex) { root.saveDialDisplay("background", hex) }
              }
              ColorPicker {
                visible: ["text","icon-text","color-text"].indexOf(root.dialDisplayMode) >= 0
                width: parent.width; enabled: !root.saving; label: "LCD text color"
                rgb: root.selectedDialDisplay.textColor || [255,255,255]
                onChosen: function(hex) { root.saveDialDisplay("foreground", hex) }
              }
            }
            Column {
              id: iconSettings
              visible: root.isDeck && (root.selectedControl === "key" ? root.supportsIcon && (root.buttonDisplayMode === "icon" || root.buttonDisplayMode === "icon-text") : root.lcdControls.length > 0 && (root.dialDisplayMode === "icon" || root.dialDisplayMode === "icon-text"))
              width: parent.width; spacing: Style.space(8)
              ToggleDropdown {
                visible: root.selectedStateOptions.length > 0
                width: parent.width; label: "Icon setting"
                options: [{value:"",label:"Default icon"}].concat(root.selectedStateOptions.map(function(s) { return {value:s.value,label:"When " + s.label} }))
                value: root.selectedIconState; enabled: !root.saving
                onChanged: function(state) { root.iconStateTarget = state; root.showIconGallery = false }
              }
              Text {
                visible: root.selectedStateOptions.length > 0
                width: parent.width; wrapMode: Text.WordWrap
                textFormat: Text.PlainText
                text: "Current state: " + ((root.selectedStateOptions.find(function(s) { return s.value === root.selectedLiveState }) || {}).label || "Unavailable")
                color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption
              }
              Text { text: root.selectedControl === "dial" ? "LCD icon" : "Button icon"; color: Qt.darker(Color.foreground, 1.4); font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
              Text { visible: root.selectedControl === "key" && !root.supportsIcon; width: parent.width; wrapMode: Text.WordWrap; text: "This control has no image display."; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.body }
              Column {
                visible: root.selectedControl === "dial" || root.supportsIcon; width: parent.width; spacing: Style.space(8)
                Row {
                  id: iconPickerRow
                  width: parent.width; spacing: Style.space(6)
                  IconButton { width: parent.width - iconReset.width - parent.spacing; text: "Browse icons (" + root.availableIcons.length + ")"; Controls.ToolTip.visible: hovered; Controls.ToolTip.text: "Add icon packs to " + root.iconsDirectory; onClicked: root.showIconGallery = !root.showIconGallery }
                  IconButton { id: iconReset; width: Style.space(32); text: "↺"; enabled: !!root.selectedIconOverride && !root.saving; Controls.ToolTip.visible: hovered; Controls.ToolTip.text: root.selectedIconState ? "Use default icon for this state" : "Use action icon"; onClicked: root.saveIcon("automatic") }
                }
                Controls.Popup {
                  id: iconPopup
                  y: content.mapToItem(iconPopup.parent, 0, editorBody.y + Style.space(8)).y
                  width: iconSettings.width
                  height: Math.max(Style.space(120), Math.min(editorBody.height - Style.space(16), root.detached ? detachedWindow.height - Style.space(140) : panel.fittedContentHeight(content.implicitHeight) - editorBody.y - Style.space(16)))
                  padding: Style.space(12)
                  focus: true; closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutsideParent
                  background: Rectangle { color: Color.background; border.color: root.controlBorder }
                  onClosed: root.showIconGallery = false
                  onOpened: iconSearchField.forceActiveFocus()
                  contentItem: Column {
                    spacing: Style.space(6)
                    IconField { id: iconSearchField; width: parent.width; placeholderText: "Search icons…"; text: root.iconSearch; onTextEdited: root.iconSearch = text; onAccepted: { if (root.filteredIcons.length && !root.saving) { root.saveIcon(root.filteredIcons[0].value); root.showIconGallery = false } } }
                  Controls.ScrollView {
                    id: iconGallery
                    width: parent.width; height: Math.max(Style.space(40), iconPopup.availableHeight - iconSearchField.height - Style.space(8))
                    contentWidth: availableWidth; clip: true
                    Controls.ScrollBar.horizontal.policy: Controls.ScrollBar.AlwaysOff
                    Text { visible: !root.filteredIcons.length; width: iconGallery.availableWidth; text: "No matching icons"; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.body }
                    Grid {
                      id: iconGrid
                      width: iconGallery.availableWidth; columns: width >= Style.space(240) ? 5 : 4; spacing: Style.space(8)
                      Repeater {
                        model: root.filteredIcons
                        Rectangle {
                          required property var modelData
                          width: (parent.width - parent.spacing * (parent.columns - 1)) / parent.columns; height: width
                          color: root.controlFace
                          border.color: root.iconReference(root.selectedIconOverride) === modelData.value ? Color.accent : root.controlBorder
                          Image { anchors.centerIn: parent; width: Math.min(Style.space(40), parent.width - Style.space(12)); height: width; source: modelData.url; fillMode: Image.PreserveAspectFit; smooth: true }
                          Controls.ToolTip.visible: iconMouse.containsMouse
                          Controls.ToolTip.text: modelData.group + " · " + modelData.label
                          MouseArea { id: iconMouse; anchors.fill: parent; hoverEnabled: true; enabled: !root.saving; cursorShape: Qt.PointingHandCursor; onClicked: { root.saveIcon(modelData.value); root.showIconGallery = false } }
                        }
                      }
                    }
                  }

                  }
                }
              }
            }
            Column {
              visible: root.isDeck && root.selectedControl === "dial"; width: parent.width; spacing: Style.space(10)
              Repeater { model: [{slot:"left",label:"Turn left"},{slot:"press",label:"Press"},{slot:"right",label:"Turn right"}]
                SearchableDropdown { id: dialDropdown; required property var modelData; width: parent.width; label: modelData.label; options: modelData.slot === "press" ? root.allActionOptions : root.dialTurnActionOptions; value: (root.selectedDials[root.selectedIndex] || {})[modelData.slot] || ""; onChanged: function(action) { root.saveAction(modelData.slot, action); dialDropdown.value = Qt.binding(function() { return (root.selectedDials[root.selectedIndex] || {})[dialDropdown.modelData.slot] || "" }) } }
              }
            }

            Column {
              visible: root.selectedDevice === "lights"; width: parent.width; spacing: Style.space(9)
              Text { text: root.selectedLightReachable() ? (root.selectedLightOn() ? "ON · REACHABLE" : "OFF · REACHABLE") : "UNAVAILABLE"; color: root.selectedLightReachable() ? (root.selectedLightOn() ? "#f0b632" : Color.muted) : Color.urgent; font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
              Text { text: "POWER"; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
              Row { width: parent.width; spacing: Style.space(6)
                Repeater { model: [{label:"ON",action:"on"},{label:"OFF",action:"off"}]
                  Rectangle { required property var modelData; width: (parent.width - Style.space(6)) / 2; height: Style.space(32); radius: 0; color: root.controlFace; border.color: root.controlBorder; opacity: root.selectedLightReachable() ? 1 : .45
                    Text { anchors.centerIn: parent; text: modelData.label; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
                    MouseArea { anchors.fill: parent; enabled: root.selectedLightReachable(); cursorShape: Qt.PointingHandCursor; onClicked: root.lightAction(modelData.action) }
                  }
                }
              }
              Text { text: "BRIGHTNESS  " + root.selectedLightValue("brightness", 0) + "%"; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
              Controls.Slider {
                id: lightBrightness; width: parent.width; from: 1; to: 100; stepSize: 1; value: root.selectedLightValue("brightness", 40); enabled: root.selectedLightReachable() && !lightProc.running
                onPressedChanged: if (!pressed) root.lightAction("brightness", value)
                background: Rectangle { x: lightBrightness.leftPadding; y: lightBrightness.topPadding + lightBrightness.availableHeight / 2 - height / 2; width: lightBrightness.availableWidth; height: Style.space(4); radius: 0; color: Qt.rgba(1,1,1,.12)
                  Rectangle { width: lightBrightness.visualPosition * parent.width; height: parent.height; radius: 0; color: Color.accent }
                }
                handle: Rectangle { x: lightBrightness.leftPadding + lightBrightness.visualPosition * (lightBrightness.availableWidth - width); y: lightBrightness.topPadding + lightBrightness.availableHeight / 2 - height / 2; implicitWidth: Style.space(12); implicitHeight: Style.space(18); radius: 0; color: Color.foreground; border.color: root.controlBorder }
              }
              Text { text: "TEMPERATURE  " + Math.round(1000000 / root.selectedLightValue("temperature", 200)) + "K"; color: Color.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
              Controls.Slider {
                id: lightTemperature; width: parent.width; from: 2900; to: 7000; stepSize: 100; value: Math.round(1000000 / root.selectedLightValue("temperature", 200)); enabled: root.selectedLightReachable() && !lightProc.running
                onPressedChanged: if (!pressed) root.lightAction("temperature", value)
                background: Rectangle { x: lightTemperature.leftPadding; y: lightTemperature.topPadding + lightTemperature.availableHeight / 2 - height / 2; width: lightTemperature.availableWidth; height: Style.space(4); radius: 0; color: Qt.rgba(1,1,1,.12)
                  Rectangle { width: lightTemperature.visualPosition * parent.width; height: parent.height; radius: 0; color: "#f0b632" }
                }
                handle: Rectangle { x: lightTemperature.leftPadding + lightTemperature.visualPosition * (lightTemperature.availableWidth - width); y: lightTemperature.topPadding + lightTemperature.availableHeight / 2 - height / 2; implicitWidth: Style.space(12); implicitHeight: Style.space(18); radius: 0; color: Color.foreground; border.color: root.controlBorder }
              }
              Rectangle { width: parent.width; height: Style.space(32); radius: 0; color: root.controlFace; border.color: root.controlBorder
                Text { anchors.centerIn: parent; text: lightProc.running ? "UPDATING…" : "REFRESH LIGHTS"; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.caption; font.bold: true }
                MouseArea { anchors.fill: parent; enabled: !lightProc.running; cursorShape: Qt.PointingHandCursor; onClicked: root.lightAction("refresh") }
              }
            }
          }
        }

        }

        Text { visible: !!root.status.lastAction; text: "Last action: " + (root.status.lastAction || "") + " · " + (root.status.lastEvent || ""); textFormat: Text.PlainText; color: Color.muted; font.family: Style.font.family; font.pixelSize: 10 }
        Text { visible: root.saveError !== "" || root.error !== "" || !!root.status.error; width: parent.width; wrapMode: Text.WrapAnywhere; text: root.saveError || root.error || root.status.error || ""; textFormat: Text.PlainText; color: Color.urgent; font.family: Style.font.family; font.pixelSize: 11 }

      }
    }
  }
  FloatingWindow {
    id: detachedWindow
    visible: false
    onVisibleChanged: if (!visible) root.commitPendingText()
    title: "Omarchy Elgato"
    color: Color.background
    implicitWidth: Style.space(760)
    implicitHeight: Math.max(Style.space(520), content.implicitHeight + Style.space(32))
    minimumSize: Qt.size(Style.space(700), Style.space(480))

    Controls.ScrollView {
      anchors.fill: parent
      anchors.margins: Style.space(16)
      contentWidth: availableWidth
      contentHeight: content.implicitHeight
      clip: true
      Item {
        id: detachedHost
        width: parent.width
        implicitHeight: content.implicitHeight
        Keys.onEscapePressed: function(event) { if (!root.cancelEdit()) root.close(); event.accepted = true }
      }
    }
  }

}
