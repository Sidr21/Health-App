// The config plugin that moves the iOS app onto the UIScene life cycle (plugins/with-scene-lifecycle.js).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { rewriteAppDelegate } = require("../../plugins/with-scene-lifecycle") as { rewriteAppDelegate: (s: string) => string };

const TEMPLATE = `@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe("with-scene-lifecycle", () => {
  it("hands the window to the scene delegate", () => {
    const out = rewriteAppDelegate(TEMPLATE);
    expect(out).toContain("class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    expect(out).not.toContain("startReactNative");
    expect(out).not.toContain("UIScreen.main.bounds");
    expect(out).toContain("_ = ExpoAppSceneDelegate.self");
    expect(out).toContain("return super.application");
  });

  it("is idempotent and refuses an unknown template", () => {
    const once = rewriteAppDelegate(TEMPLATE);
    expect(rewriteAppDelegate(once)).toBe(once);
    expect(() => rewriteAppDelegate("class AppDelegate: Something {}")).toThrow(/doesn't match/);
  });
});
