/**
 * Signal Payload Validation Schemas
 *
 * Zod schemas for validating signal payloads.
 * Ensures only safe, expected data is accepted.
 */
import { z } from 'zod';
/**
 * SESSION_START payload schema
 */
export declare const sessionStartPayloadSchema: z.ZodObject<{
    workspace_name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    workspace_name: string;
}, {
    workspace_name: string;
}>;
/**
 * SESSION_END payload schema
 */
export declare const sessionEndPayloadSchema: z.ZodObject<{
    focused_seconds: z.ZodNumber;
    active_seconds: z.ZodNumber;
    reason: z.ZodEnum<["close", "idle_timeout", "manual"]>;
}, "strip", z.ZodTypeAny, {
    focused_seconds: number;
    active_seconds: number;
    reason: "close" | "idle_timeout" | "manual";
}, {
    focused_seconds: number;
    active_seconds: number;
    reason: "close" | "idle_timeout" | "manual";
}>;
/**
 * BURST_FLAG payload schema
 */
export declare const burstFlagPayloadSchema: z.ZodObject<{
    severity: z.ZodEnum<["low", "medium", "high"]>;
    edit_count: z.ZodNumber;
    char_count: z.ZodNumber;
    window_ms: z.ZodNumber;
    file_name: z.ZodString;
    file_extension: z.ZodString;
}, "strip", z.ZodTypeAny, {
    severity: "low" | "medium" | "high";
    edit_count: number;
    char_count: number;
    window_ms: number;
    file_name: string;
    file_extension: string;
}, {
    severity: "low" | "medium" | "high";
    edit_count: number;
    char_count: number;
    window_ms: number;
    file_name: string;
    file_extension: string;
}>;
/**
 * CHECKPOINT_CREATED payload schema
 */
export declare const checkpointCreatedPayloadSchema: z.ZodObject<{
    checkpoint_id: z.ZodString;
    file_count: z.ZodNumber;
    log_head_hash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    checkpoint_id: string;
    file_count: number;
    log_head_hash: string;
}, {
    checkpoint_id: string;
    file_count: number;
    log_head_hash: string;
}>;
/**
 * File change info schema
 */
export declare const fileChangeInfoSchema: z.ZodObject<{
    path: z.ZodString;
    change_type: z.ZodEnum<["added", "modified", "deleted"]>;
}, "strip", z.ZodTypeAny, {
    path: string;
    change_type: "added" | "modified" | "deleted";
}, {
    path: string;
    change_type: "added" | "modified" | "deleted";
}>;
/**
 * UNVERIFIED_CHANGES payload schema
 */
export declare const unverifiedChangesPayloadSchema: z.ZodObject<{
    files_added: z.ZodNumber;
    files_modified: z.ZodNumber;
    files_deleted: z.ZodNumber;
    lines_added: z.ZodNumber;
    lines_removed: z.ZodNumber;
    last_checkpoint_id: z.ZodNullable<z.ZodString>;
    top_paths: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        change_type: z.ZodEnum<["added", "modified", "deleted"]>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        change_type: "added" | "modified" | "deleted";
    }, {
        path: string;
        change_type: "added" | "modified" | "deleted";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    files_added: number;
    files_modified: number;
    files_deleted: number;
    lines_added: number;
    lines_removed: number;
    last_checkpoint_id: string | null;
    top_paths?: {
        path: string;
        change_type: "added" | "modified" | "deleted";
    }[] | undefined;
}, {
    files_added: number;
    files_modified: number;
    files_deleted: number;
    lines_added: number;
    lines_removed: number;
    last_checkpoint_id: string | null;
    top_paths?: {
        path: string;
        change_type: "added" | "modified" | "deleted";
    }[] | undefined;
}>;
/**
 * INTEGRITY_COMPROMISED payload schema
 */
export declare const integrityCompromisedPayloadSchema: z.ZodObject<{
    reason: z.ZodEnum<["missing_log", "broken_hash_chain", "missing_checkpoint", "missing_assignment"]>;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    reason: "missing_checkpoint" | "missing_log" | "broken_hash_chain" | "missing_assignment";
}, {
    description: string;
    reason: "missing_checkpoint" | "missing_log" | "broken_hash_chain" | "missing_assignment";
}>;
/**
 * STATUS_UPDATE payload schema
 * Periodic summary of current session state
 */
export declare const statusUpdatePayloadSchema: z.ZodObject<{
    total_focused_seconds: z.ZodNumber;
    total_active_seconds: z.ZodNumber;
    session_count: z.ZodNumber;
    burst_count: z.ZodNumber;
    burst_by_severity: z.ZodObject<{
        low: z.ZodNumber;
        medium: z.ZodNumber;
        high: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        low: number;
        medium: number;
        high: number;
    }, {
        low: number;
        medium: number;
        high: number;
    }>;
    checkpoint_count: z.ZodNumber;
    unverified_change_count: z.ZodNumber;
    integrity_passed: z.ZodBoolean;
    session_active: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    total_focused_seconds: number;
    total_active_seconds: number;
    session_count: number;
    burst_count: number;
    burst_by_severity: {
        low: number;
        medium: number;
        high: number;
    };
    checkpoint_count: number;
    unverified_change_count: number;
    integrity_passed: boolean;
    session_active: boolean;
}, {
    total_focused_seconds: number;
    total_active_seconds: number;
    session_count: number;
    burst_count: number;
    burst_by_severity: {
        low: number;
        medium: number;
        high: number;
    };
    checkpoint_count: number;
    unverified_change_count: number;
    integrity_passed: boolean;
    session_active: boolean;
}>;
/**
 * Union of all signal payload schemas
 */
export declare const signalPayloadSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"SESSION_START">;
    payload: z.ZodObject<{
        workspace_name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        workspace_name: string;
    }, {
        workspace_name: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "SESSION_START";
    payload: {
        workspace_name: string;
    };
}, {
    type: "SESSION_START";
    payload: {
        workspace_name: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"SESSION_END">;
    payload: z.ZodObject<{
        focused_seconds: z.ZodNumber;
        active_seconds: z.ZodNumber;
        reason: z.ZodEnum<["close", "idle_timeout", "manual"]>;
    }, "strip", z.ZodTypeAny, {
        focused_seconds: number;
        active_seconds: number;
        reason: "close" | "idle_timeout" | "manual";
    }, {
        focused_seconds: number;
        active_seconds: number;
        reason: "close" | "idle_timeout" | "manual";
    }>;
}, "strip", z.ZodTypeAny, {
    type: "SESSION_END";
    payload: {
        focused_seconds: number;
        active_seconds: number;
        reason: "close" | "idle_timeout" | "manual";
    };
}, {
    type: "SESSION_END";
    payload: {
        focused_seconds: number;
        active_seconds: number;
        reason: "close" | "idle_timeout" | "manual";
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"BURST_FLAG">;
    payload: z.ZodObject<{
        severity: z.ZodEnum<["low", "medium", "high"]>;
        edit_count: z.ZodNumber;
        char_count: z.ZodNumber;
        window_ms: z.ZodNumber;
        file_name: z.ZodString;
        file_extension: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        severity: "low" | "medium" | "high";
        edit_count: number;
        char_count: number;
        window_ms: number;
        file_name: string;
        file_extension: string;
    }, {
        severity: "low" | "medium" | "high";
        edit_count: number;
        char_count: number;
        window_ms: number;
        file_name: string;
        file_extension: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "BURST_FLAG";
    payload: {
        severity: "low" | "medium" | "high";
        edit_count: number;
        char_count: number;
        window_ms: number;
        file_name: string;
        file_extension: string;
    };
}, {
    type: "BURST_FLAG";
    payload: {
        severity: "low" | "medium" | "high";
        edit_count: number;
        char_count: number;
        window_ms: number;
        file_name: string;
        file_extension: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"CHECKPOINT_CREATED">;
    payload: z.ZodObject<{
        checkpoint_id: z.ZodString;
        file_count: z.ZodNumber;
        log_head_hash: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        checkpoint_id: string;
        file_count: number;
        log_head_hash: string;
    }, {
        checkpoint_id: string;
        file_count: number;
        log_head_hash: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "CHECKPOINT_CREATED";
    payload: {
        checkpoint_id: string;
        file_count: number;
        log_head_hash: string;
    };
}, {
    type: "CHECKPOINT_CREATED";
    payload: {
        checkpoint_id: string;
        file_count: number;
        log_head_hash: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"UNVERIFIED_CHANGES">;
    payload: z.ZodObject<{
        files_added: z.ZodNumber;
        files_modified: z.ZodNumber;
        files_deleted: z.ZodNumber;
        lines_added: z.ZodNumber;
        lines_removed: z.ZodNumber;
        last_checkpoint_id: z.ZodNullable<z.ZodString>;
        top_paths: z.ZodOptional<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            change_type: z.ZodEnum<["added", "modified", "deleted"]>;
        }, "strip", z.ZodTypeAny, {
            path: string;
            change_type: "added" | "modified" | "deleted";
        }, {
            path: string;
            change_type: "added" | "modified" | "deleted";
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        files_added: number;
        files_modified: number;
        files_deleted: number;
        lines_added: number;
        lines_removed: number;
        last_checkpoint_id: string | null;
        top_paths?: {
            path: string;
            change_type: "added" | "modified" | "deleted";
        }[] | undefined;
    }, {
        files_added: number;
        files_modified: number;
        files_deleted: number;
        lines_added: number;
        lines_removed: number;
        last_checkpoint_id: string | null;
        top_paths?: {
            path: string;
            change_type: "added" | "modified" | "deleted";
        }[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "UNVERIFIED_CHANGES";
    payload: {
        files_added: number;
        files_modified: number;
        files_deleted: number;
        lines_added: number;
        lines_removed: number;
        last_checkpoint_id: string | null;
        top_paths?: {
            path: string;
            change_type: "added" | "modified" | "deleted";
        }[] | undefined;
    };
}, {
    type: "UNVERIFIED_CHANGES";
    payload: {
        files_added: number;
        files_modified: number;
        files_deleted: number;
        lines_added: number;
        lines_removed: number;
        last_checkpoint_id: string | null;
        top_paths?: {
            path: string;
            change_type: "added" | "modified" | "deleted";
        }[] | undefined;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"INTEGRITY_COMPROMISED">;
    payload: z.ZodObject<{
        reason: z.ZodEnum<["missing_log", "broken_hash_chain", "missing_checkpoint", "missing_assignment"]>;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        description: string;
        reason: "missing_checkpoint" | "missing_log" | "broken_hash_chain" | "missing_assignment";
    }, {
        description: string;
        reason: "missing_checkpoint" | "missing_log" | "broken_hash_chain" | "missing_assignment";
    }>;
}, "strip", z.ZodTypeAny, {
    type: "INTEGRITY_COMPROMISED";
    payload: {
        description: string;
        reason: "missing_checkpoint" | "missing_log" | "broken_hash_chain" | "missing_assignment";
    };
}, {
    type: "INTEGRITY_COMPROMISED";
    payload: {
        description: string;
        reason: "missing_checkpoint" | "missing_log" | "broken_hash_chain" | "missing_assignment";
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"STATUS_UPDATE">;
    payload: z.ZodObject<{
        total_focused_seconds: z.ZodNumber;
        total_active_seconds: z.ZodNumber;
        session_count: z.ZodNumber;
        burst_count: z.ZodNumber;
        burst_by_severity: z.ZodObject<{
            low: z.ZodNumber;
            medium: z.ZodNumber;
            high: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            low: number;
            medium: number;
            high: number;
        }, {
            low: number;
            medium: number;
            high: number;
        }>;
        checkpoint_count: z.ZodNumber;
        unverified_change_count: z.ZodNumber;
        integrity_passed: z.ZodBoolean;
        session_active: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        total_focused_seconds: number;
        total_active_seconds: number;
        session_count: number;
        burst_count: number;
        burst_by_severity: {
            low: number;
            medium: number;
            high: number;
        };
        checkpoint_count: number;
        unverified_change_count: number;
        integrity_passed: boolean;
        session_active: boolean;
    }, {
        total_focused_seconds: number;
        total_active_seconds: number;
        session_count: number;
        burst_count: number;
        burst_by_severity: {
            low: number;
            medium: number;
            high: number;
        };
        checkpoint_count: number;
        unverified_change_count: number;
        integrity_passed: boolean;
        session_active: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "STATUS_UPDATE";
    payload: {
        total_focused_seconds: number;
        total_active_seconds: number;
        session_count: number;
        burst_count: number;
        burst_by_severity: {
            low: number;
            medium: number;
            high: number;
        };
        checkpoint_count: number;
        unverified_change_count: number;
        integrity_passed: boolean;
        session_active: boolean;
    };
}, {
    type: "STATUS_UPDATE";
    payload: {
        total_focused_seconds: number;
        total_active_seconds: number;
        session_count: number;
        burst_count: number;
        burst_by_severity: {
            low: number;
            medium: number;
            high: number;
        };
        checkpoint_count: number;
        unverified_change_count: number;
        integrity_passed: boolean;
        session_active: boolean;
    };
}>]>;
/**
 * Validate payload based on signal type
 */
export declare function validateSignalPayload(type: string, payload: unknown): unknown;
//# sourceMappingURL=signals.d.ts.map