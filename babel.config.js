/**
 * The library's own code goes through bob's preset (what `bob build` uses, and what Jest runs);
 * anything from node_modules that Jest has to transform goes through React Native's.
 */
module.exports = {
  overrides: [
    {
      exclude: /[\\/]node_modules[\\/]/,
      presets: ['module:react-native-builder-bob/babel-preset'],
    },
    {
      include: /[\\/]node_modules[\\/]/,
      presets: ['module:@react-native/babel-preset'],
    },
  ],
};
