<?php

namespace Tests\Feature;

use Tests\TestCase;

class NoteTest extends TestCase
{
    public function test_a_title_is_required(): void
    {
        $response = $this->postJson('/api/notes', ['body' => 'no title']);

        $response->assertStatus(422);
    }
}
