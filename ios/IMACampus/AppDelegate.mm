#import "AppDelegate.h"
#import <Firebase/Firebase.h>
#import <Expo/Expo.h>

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <PushKit/PushKit.h>
#import <RNCallKeep/RNCallKeep.h>
#import "RNVoipPushNotificationManager.h"

@interface AppDelegate () <PKPushRegistryDelegate>
@end

@implementation AppDelegate

- (instancetype)init
{
  NSLog(@"[IMA APP] AppDelegate init entered!");
  if (self = [super init]) {
    self.automaticallyLoadReactNativeWindow = NO;
    NSLog(@"[IMA APP] AppDelegate super init completed!");
  }
  return self;
}

- (UISceneConfiguration *)application:(UIApplication *)application configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession options:(UISceneConnectionOptions *)options
{
  NSLog(@"[IMA APP] configurationForConnectingSceneSession entered!");
  return [[UISceneConfiguration alloc] initWithName:@"Default Configuration" sessionRole:connectingSceneSession.role];
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSLog(@"[IMA APP] didFinishLaunchingWithOptions entered!");
// @generated begin @react-native-firebase/app-didFinishLaunchingWithOptions - expo prebuild (DO NOT MODIFY) sync-ecd111c37e49fdd1ed6354203cd6b1e2a38cccda
[FIRApp configure];
// @generated end @react-native-firebase/app-didFinishLaunchingWithOptions
  self.moduleName = @"main";
  self.dependencyProvider = [RCTAppDependencyProvider new];

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  NSURL *metroURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
  if (metroURL) {
    return metroURL;
  }
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  [RNCallKeep application:application openURL:url options:options];
  return [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  [RNCallKeep application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
}

#pragma mark - PKPushRegistryDelegate

// Handle updated push credentials (VoIP token from Apple)
- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)credentials forType:(PKPushType)type {
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry didInvalidatePushTokenForType:(PKPushType)type {
}

// Handle incoming pushes when app is in background or killed
- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
  NSDictionary *dict = payload.dictionaryPayload;
  NSString *uuid = dict[@"callId"] ?: dict[@"uuid"] ?: [[NSUUID UUID] UUIDString];
  NSString *callerName = dict[@"leadName"] ?: dict[@"callerName"] ?: @"Student";
  NSString *handle = dict[@"from"] ?: dict[@"handle"] ?: @"WhatsApp Call";

  [RNVoipPushNotificationManager addCompletionHandler:uuid completionHandler:completion];
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];

  // Immediately report incoming call to iOS CallKit before execution completion
  [RNCallKeep reportNewIncomingCall:uuid
                             handle:handle
                         handleType:@"generic"
                           hasVideo:NO
                localizedCallerName:callerName
                    supportsHolding:NO
                       supportsDTMF:NO
                   supportsGrouping:NO
                 supportsUngrouping:NO
                        fromPushKit:YES
                            payload:dict
              withCompletionHandler:nil];

  completion();
}

// Explicitly define remote notification delegates to ensure compatibility with third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
}

// Explicitly define remote notification delegates to ensure compatibility with third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
}

// Explicitly define remote notification delegates to ensure compatibility with third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  completionHandler(UIBackgroundFetchResultNoData);
}

@end

#pragma mark - SceneDelegate

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (strong, nonatomic) UIWindow *window;
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions
{
  NSLog(@"[IMA APP] SceneDelegate scene:willConnectToSession entered!");
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  UIWindowScene *windowScene = (UIWindowScene *)scene;
  AppDelegate *appDelegate = (AppDelegate *)[UIApplication sharedApplication].delegate;

  UIWindow *window = [[UIWindow alloc] initWithWindowScene:windowScene];
  self.window = window;
  appDelegate.window = window;

  UIView *rootView = [appDelegate.rootViewFactory viewWithModuleName:appDelegate.moduleName
                                                   initialProperties:appDelegate.initialProps
                                                       launchOptions:nil];
  UIViewController *rootViewController = [appDelegate createRootViewController];
  [appDelegate setRootView:rootView toRootViewController:rootViewController];
  window.rootViewController = rootViewController;
  [window makeKeyAndVisible];
  NSLog(@"[IMA APP] SceneDelegate makeKeyAndVisible completed!");
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  UIOpenURLContext *context = URLContexts.anyObject;
  if (context) {
    [RCTLinkingManager application:[UIApplication sharedApplication] openURL:context.URL options:@{}];
  }
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager application:[UIApplication sharedApplication] continueUserActivity:userActivity restorationHandler:^(NSArray<id<UIUserActivityRestoring>> * _Nullable restorableObjects) {}];
}

@end
