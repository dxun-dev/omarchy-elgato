export const help = `omarchy-elgato — Omarchy Elgato
Usage: bin/omarchy-elgato <command>
  init                         Create this plugin's independent profile
  profile                      Print profile JSON
  catalog                      Print available actions as JSON
  action-packs                 List action packs and dependency/manifest errors
  status [--json]               Print daemon status
  icons                        List preset and custom icons
  set-dial-display MODEL INDEX mode|text|background|foreground|icon VALUE
  dial-previews MODEL         Render configured dial LCD previews
  button-previews MODEL        Render button previews using hardware artwork
  set-device-display MODEL INDEX text|icon-text|icon|color|color-text
  set-device-color MODEL INDEX button|text|dial #RRGGBB
  set-device-text MODEL INDEX automatic|hidden|custom [TEXT]
  set-state-icon MODEL INDEX button|dial STATE ICON
  set-device-icon MODEL INDEX ICON
                               ICON: automatic, preset:FILENAME, or image path
  page MODEL add NAME | select ID | rename ID NAME | duplicate ID NAME | delete ID
  folder-create MODEL PARENT_ID INDEX NAME
                               Create a folder assigned to this button
  folder-back MODEL            Return to previous page or folder
  page-catalog MODEL           List page and folder actions
  Mapping and preview commands accept --page ID; default is active page
  models                       List all supported model layouts (no USB access)
  set-device-key MODEL INDEX ACTION
  set-device-dial MODEL INDEX SLOT ACTION
                               Set independent mappings, including offline models
  devices                      List supported USB devices (does not open them)
  set-key INDEX ACTION         Set a Plus key (1–8)
  set-classic-key INDEX ACTION  Set a Classic key (1–15)
  set-dial INDEX SLOT ACTION    Set a Plus dial (1–4; left/press/right)
  lights ACTION [--target all|INDEX] [--value VALUE]
                               on/off/toggle/brightness/temperature/refresh
  daemon [--no-hardware]        Run service; no-hardware skips USB access
`;
//# sourceMappingURL=help.js.map