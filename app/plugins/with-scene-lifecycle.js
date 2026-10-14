/**
 * Adopt the UIScene life cycle, which apps built with the iOS 27 SDK must use: without it the app
 * stops at launch with "UIScene life cycle is required for apps built with this SDK".
 *
 * Expo 57 ships the pieces (`ExpoAppSceneDelegate`, `ExpoReactNativeFactoryProvider`) but its
 * prebuild template still starts React Native from the app delegate. This plugin rewires the
 * generated project: the app delegate keeps creating the React Native factory and the scene
 * delegate creates the window and starts React Native in it. Skips itself once the template
 * does this on its own.
 */
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const SCENE_DELEGATE = "EXExpoAppSceneDelegate"; // @objc name of Expo's ExpoAppSceneDelegate

// the template's window + startReactNative block inside didFinishLaunching
const START_IN_APP_DELEGATE =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function rewriteAppDelegate(src) {
  if (src.includes("ExpoReactNativeFactoryProvider")) return src; // already scene-based
  if (!/class AppDelegate: ExpoAppDelegate \{/.test(src) || !START_IN_APP_DELEGATE.test(src)) {
    throw new Error(
      "with-scene-lifecycle: AppDelegate.swift doesn't match the Expo 57 template; " +
        "check whether Expo now adopts the scene life cycle itself and drop this plugin.",
    );
  }
  return src
    .replace("class AppDelegate: ExpoAppDelegate {", "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {")
    .replace(
      START_IN_APP_DELEGATE,
      "\n    // The scene delegate (Info.plist UIApplicationSceneManifest) creates the window and starts\n" +
        "    // React Native in it; referencing it here also keeps the linker from stripping the class.\n" +
        "    _ = ExpoAppSceneDelegate.self\n",
    );
}

function withSceneLifecycle(config) {
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") {
      throw new Error("with-scene-lifecycle: expected a Swift AppDelegate");
    }
    c.modResults.contents = rewriteAppDelegate(c.modResults.contents);
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: SCENE_DELEGATE },
        ],
      },
    };
    return c;
  });
  return config;
}

module.exports = withSceneLifecycle;
module.exports.rewriteAppDelegate = rewriteAppDelegate;
