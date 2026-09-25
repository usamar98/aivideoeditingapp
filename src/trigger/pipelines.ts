// Keep the existing video workers and their task IDs intact. Trigger discovers
// these exports through the configured src/trigger directory.
export { episodePipeline } from "../../trigger/episode-pipeline";
export { facelessPipeline } from "../../trigger/faceless-pipeline";
export { cartoonPipeline } from "../../trigger/cartoon-pipeline";
export { ugcPipeline } from "../../trigger/ugc-pipeline";
export { shortsPipeline } from "../../trigger/shorts-pipeline";
