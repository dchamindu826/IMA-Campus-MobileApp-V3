import 'react-native-url-polyfill/auto'; // <-- මේක අලුතෙන් දැම්මා
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent('main', () => App);