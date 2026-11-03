#import "AppDelegate.h"
#import <Firebase/Firebase.h>
#import <Expo/Expo.h>

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <PushKit/PushKit.h>
#import <RNCallKeep/RNCallKeep.h>
#import "RNVoipPushNotificationManager.h"
#import <CommonCrypto/CommonDigest.h>

static NSString *toValidUUID(NSString *rawString) {
  if (!rawString || [rawString length] == 0) {
    return [[NSUUID UUID] UUIDString];
  }
  NSUUID *parsed = [[NSUUID alloc] initWithUUIDString:rawString];
  if (parsed != nil) {
    return [parsed UUIDString];
  }
  const char *str = [rawString UTF8String];
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(str, (CC_LONG)strlen(str), digest);
  digest[6] = (digest[6] & 0x0F) | 0x40; // Version 4
  digest[8] = (digest[8] & 0x3F) | 0x80; // IETF variant
  return [[NSString stringWithFormat:
          @"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
          digest[0], digest[1], digest[2], digest[3],
          digest[4], digest[5],
          digest[6], digest[7],
          digest[8], digest[9],
          digest[10], digest[11], digest[12], digest[13], digest[14], digest[15]] lowercaseString];
}

@interface AppDelegate () <PKPushRegistryDelegate>
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
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
  return [NSURL URLWithString:@"http://192.168.8.187:8081/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false"];
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
  NSString *rawCallId = dict[@"callId"] ?: dict[@"uuid"] ?: dict[@"id"];
  NSString *uuid = toValidUUID(rawCallId);
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
                    supportsHolding:YES
                       supportsDTMF:YES
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
