import "react-native-url-polyfill/auto";
import * as WebBrowser from "expo-web-browser";
import * as SplashScreen from "expo-splash-screen";
import { registerRootComponent } from "expo";
import App from "./App";

WebBrowser.maybeCompleteAuthSession();

SplashScreen.setOptions({ fade: true, duration: 280 });
void SplashScreen.preventAutoHideAsync();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
