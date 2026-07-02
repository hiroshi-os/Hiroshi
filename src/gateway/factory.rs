use crate::config::AppConfig;
use crate::gateway::traits::ChannelDriver;


pub fn load_channel_drivers(config: &AppConfig) -> Vec<Box<dyn ChannelDriver>> {
    let mut drivers: Vec<Box<dyn ChannelDriver>> = Vec::new();

    if config.mattermost.enabled {
        drivers.push(Box::new(crate::gateway::mattermost::MattermostDriver::new(
            config.mattermost.clone()
        )));
    }

    // We can scale to other dynamic drivers (e.g. WhatsApp config matching) here cleanly
    drivers
}
