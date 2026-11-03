// Safari's page, handed to the share extension as it is drawn (iOS, NSExtensionJavaScriptPreprocessingFile): its HTML,
// title and address, so "Attach to..." can keep the page itself as a file on a project or a task.
var Page = function () {};
Page.prototype = {
  run: function (args) {
    args.completionFunction({ html: document.documentElement.outerHTML, title: document.title, url: document.URL });
  },
  finalize: function () {},
};
var ExtensionPreprocessingJS = new Page();
