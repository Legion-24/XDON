"""Shared test configuration and fixtures."""

import pytest


FIXTURES = {
    'basic': {
        'lmon': '(name,age,active)\nalice:{Alice,30,true}\nbob:{Bob,25,false}\n',
        'json': {
            'alice': {'name': 'Alice', 'age': 30, 'active': True},
            'bob': {'name': 'Bob', 'age': 25, 'active': False},
        },
    },
    'no-header': {
        'lmon': '{Alice,30,true}\n{Bob,25,false}\n',
        'json': [
            ['Alice', 30, True],
            ['Bob', 25, False],
        ],
    },
    'arrays': {
        'lmon': '(name,tags[],verified)\nalice:{Alice,[admin,developer],true}\nbob:{Bob,[user],false}\n',
        'json': {
            'alice': {'name': 'Alice', 'tags': ['admin', 'developer'], 'verified': True},
            'bob': {'name': 'Bob', 'tags': ['user'], 'verified': False},
        },
    },
    'nested': {
        'lmon': '(name,address:(city,zip))\nalice:{Alice,{NYC,10001}}\nbob:{Bob,{LA,90001}}\n',
        'json': {
            'alice': {'name': 'Alice', 'address': {'city': 'NYC', 'zip': '10001'}},
            'bob': {'name': 'Bob', 'address': {'city': 'LA', 'zip': '90001'}},
        },
    },
    'types': {
        'lmon': '(string,integer,float,boolean,null_val)\nexample:{hello,42,3.14,true,null}\n',
        'json': {
            'example': {
                'string': 'hello',
                'integer': 42,
                'float': 3.14,
                'boolean': True,
                'null_val': None,
            },
        },
    },
    'escaped': {
        'lmon': '(name,description)\nitem1:{Widget,"A \\, B, and C"}\nitem2:{Gadget,"Quote: \\"Hello\\""}\n',
        'json': {
            'item1': {'name': 'Widget', 'description': 'A , B, and C'},
            'item2': {'name': 'Gadget', 'description': 'Quote: "Hello"'},
        },
    },
    'empty-values': {
        'lmon': '(name,email,phone)\nuser1:{Alice,,555-1234}\nuser2:{Bob,bob@example.com,}\n',
        'json': {
            'user1': {'name': 'Alice', 'email': '', 'phone': '555-1234'},
            'user2': {'name': 'Bob', 'email': 'bob@example.com', 'phone': ''},
        },
    },
}


@pytest.fixture(params=FIXTURES.keys())
def fixture_name(request):
    """Parametrized fixture name."""
    return request.param


@pytest.fixture
def fixture_data(fixture_name):
    """Get fixture data by name."""
    return FIXTURES[fixture_name]
