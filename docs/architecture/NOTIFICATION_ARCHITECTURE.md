# Notification Architecture

**NOTIF-001:** notifications originate from domain events. MVP channel: in-app. Future: email/push. Events include task assignment, roster assignment, finance approval requirement, event publication and subscription changes. Notification failure must not silently corrupt the originating transaction.
