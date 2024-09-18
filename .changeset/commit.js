exports.default = {
  getAddMessage: ({ releases, summary }) => {
    const { type } = releases[0];
    const scopes = releases
      .map((release) => release.name.replace("@typespec-tools/", ""))
      .join(",");
    return `${type}(${scopes}): ${summary}`;
  },
  // getVersionMessage
};
