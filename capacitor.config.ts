import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.drate.app',
  appName: 'Drate',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
    StatusBar: {
      style: 'DARK',
      overlay: true,
    },
  },
};

export default config;
